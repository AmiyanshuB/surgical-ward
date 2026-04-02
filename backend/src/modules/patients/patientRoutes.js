const express = require('express');
const { query } = require('../../db/db');
const { authenticate, requireRole } = require('../../common/authMiddleware');
const { evaluateRisk } = require('../risk/riskEngine');

const router = express.Router();
router.use(authenticate);

// Helper: get active flags for a patient
async function getActiveFlags(patientId) {
  const r = await query(
    'SELECT flag_type, severity FROM red_flags WHERE patient_id = $1 AND is_active = true',
    [patientId]
  );
  return r.rows;
}

// Helper: get latest vitals for a patient
async function getLatestVitals(patientId) {
  const r = await query(
    `SELECT hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_at
     FROM vital_snapshots WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [patientId]
  );
  return r.rows[0] || null;
}

// GET /patients/active - Dashboard list (optimised: 4 bulk queries, no N+1)
router.get('/active', async (req, res) => {
  try {
    // Query 1: patients + encounters
    const patientsResult = await query(`
      SELECT p.id, p.patient_code, p.full_name, p.age, p.gender, p.bed_number,
             p.diagnosis, p.surgery_name, p.consultant_name, p.team_name, p.status,
             e.id AS encounter_id, e.admission_date, e.surgery_date, e.ward_name,
             COALESCE(CURRENT_DATE - e.surgery_date, 0) AS pod
      FROM patients p
      LEFT JOIN encounters e ON e.patient_id = p.id AND e.is_active = true
      WHERE p.status = 'active'
      ORDER BY p.bed_number
    `);

    if (patientsResult.rows.length === 0) return res.json([]);

    const patientIds = patientsResult.rows.map(r => r.id);
    const idList = patientIds.join(',');

    // Query 2: latest vitals for ALL active patients in one shot
    const vitalsResult = await query(`
      SELECT DISTINCT ON (patient_id)
        patient_id, hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_at
      FROM vital_snapshots
      WHERE patient_id = ANY($1)
      ORDER BY patient_id, recorded_at DESC
    `, [patientIds]);

    // Query 3: active flags for ALL patients
    const flagsResult = await query(`
      SELECT patient_id, flag_type, severity
      FROM red_flags
      WHERE patient_id = ANY($1) AND is_active = true
    `, [patientIds]);

    // Query 4: latest note (risk_override + summary) for ALL patients
    const notesResult = await query(`
      SELECT DISTINCT ON (patient_id)
        patient_id, risk_override, status_summary, created_at
      FROM round_notes
      WHERE patient_id = ANY($1)
      ORDER BY patient_id, created_at DESC
    `, [patientIds]);

    // Query 5: active devices for ALL patients
    const devicesResult = await query(`
      SELECT patient_id, device_type
      FROM devices
      WHERE patient_id = ANY($1) AND status = 'active'
    `, [patientIds]);

    // Index everything by patient_id for O(1) lookup
    const vitalsMap = {};
    vitalsResult.rows.forEach(v => { vitalsMap[v.patient_id] = v; });

    const flagsMap = {};
    flagsResult.rows.forEach(f => {
      if (!flagsMap[f.patient_id]) flagsMap[f.patient_id] = [];
      flagsMap[f.patient_id].push(f);
    });

    const notesMap = {};
    notesResult.rows.forEach(n => { notesMap[n.patient_id] = n; });

    const devicesMap = {};
    devicesResult.rows.forEach(d => {
      if (!devicesMap[d.patient_id]) devicesMap[d.patient_id] = [];
      devicesMap[d.patient_id].push(d.device_type);
    });

    // Assemble final response
    const patients = patientsResult.rows.map(row => {
      const vitals = vitalsMap[row.id] || null;
      const flags = flagsMap[row.id] || [];
      const flagTypes = flags.map(f => f.flag_type);
      const latestNote = notesMap[row.id] || null;

      const riskResult = evaluateRisk({
        hr: vitals?.hr,
        systolic_bp: vitals?.systolic_bp,
        spo2: vitals?.spo2 != null ? parseFloat(vitals.spo2) : null,
        rr: vitals?.rr,
        temp_c: vitals?.temp_c != null ? parseFloat(vitals.temp_c) : null,
        lactate: vitals?.lactate != null ? parseFloat(vitals.lactate) : null,
        glucose: vitals?.glucose != null ? parseFloat(vitals.glucose) : null,
        active_flags: flagTypes,
        risk_override: latestNote?.risk_override || null,
      });

      return {
        ...row,
        vitals,
        active_flags: flags,
        devices: devicesMap[row.id] || [],
        risk: riskResult.risk_level,
        risk_reasons: riskResult.reasons,
        latest_note_summary: latestNote?.status_summary || null,
        latest_note_at: latestNote?.created_at || null,
      };
    });

    res.json(patients);
  } catch (err) {
    console.error('GET /patients/active error:', err);
    res.status(500).json({ error: 'Failed to fetch patients', detail: err.message });
  }
});

// GET /patients/:id - Full patient detail (parallel queries)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Run all queries in parallel - single round trip each, all at the same time
    const [patRes, vitalsRes, flagsRes, devRes, recentNotesRes] = await Promise.all([
      query(`
        SELECT p.*, e.id AS encounter_id, e.admission_date, e.surgery_date, e.ward_name,
               COALESCE(CURRENT_DATE - e.surgery_date, 0) AS pod
        FROM patients p
        LEFT JOIN encounters e ON e.patient_id = p.id AND e.is_active = true
        WHERE p.id = $1
      `, [id]),
      query(`
        SELECT hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_at
        FROM vital_snapshots WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1
      `, [id]),
      query(`SELECT flag_type, severity, id FROM red_flags WHERE patient_id = $1 AND is_active = true`, [id]),
      query(`SELECT * FROM devices WHERE patient_id = $1 AND status = 'active' ORDER BY inserted_at DESC`, [id]),
      query(`
        SELECT rn.*, u.full_name AS author_name
        FROM round_notes rn
        LEFT JOIN users u ON u.id = rn.created_by_user_id
        WHERE rn.patient_id = $1 ORDER BY rn.created_at DESC LIMIT 5
      `, [id]),
    ]);

    if (!patRes.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    const patient = patRes.rows[0];
    const vitals = vitalsRes.rows[0] || null;
    const flags = flagsRes.rows;
    const flagTypes = flags.map(f => f.flag_type);
    const riskOverride = recentNotesRes.rows[0]?.risk_override || null;

    const riskResult = evaluateRisk({
      hr: vitals?.hr,
      systolic_bp: vitals?.systolic_bp,
      spo2: vitals?.spo2 != null ? parseFloat(vitals.spo2) : null,
      rr: vitals?.rr,
      temp_c: vitals?.temp_c != null ? parseFloat(vitals.temp_c) : null,
      lactate: vitals?.lactate != null ? parseFloat(vitals.lactate) : null,
      glucose: vitals?.glucose != null ? parseFloat(vitals.glucose) : null,
      active_flags: flagTypes,
      risk_override: riskOverride,
    });

    res.json({
      ...patient,
      vitals,
      active_flags: flags,
      devices: devRes.rows,
      risk: riskResult.risk_level,
      risk_reasons: riskResult.reasons,
      recent_notes: recentNotesRes.rows,
    });
  } catch (err) {
    console.error('GET /patients/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch patient', detail: err.message });
  }
});
// GET /patients/:id/timeline
router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT te.*, u.full_name AS actor_name
      FROM timeline_events te
      LEFT JOIN users u ON u.id = te.actor_user_id
      WHERE te.patient_id = $1
      ORDER BY te.event_time DESC
      LIMIT 50
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('GET timeline error:', err);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// GET /patients/:id/vitals/latest
router.get('/:id/vitals/latest', async (req, res) => {
  try {
    const vitals = await getLatestVitals(req.params.id);
    if (!vitals) return res.status(404).json({ error: 'No vitals found' });
    res.json(vitals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vitals' });
  }
});

// GET /patients/:id/vitals/history - full date-by-date vitals history
router.get('/:id/vitals/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 30 } = req.query;
    const result = await query(`
      SELECT
        vs.id,
        vs.recorded_at,
        vs.hr,
        vs.systolic_bp,
        vs.diastolic_bp,
        vs.rr,
        vs.spo2,
        vs.temp_c,
        vs.uop_ml,
        vs.glucose,
        vs.lactate,
        vs.source,
        u.full_name AS recorded_by,
        DATE(vs.recorded_at) AS record_date
      FROM vital_snapshots vs
      LEFT JOIN users u ON u.id = vs.recorded_by_user_id
      WHERE vs.patient_id = $1
      ORDER BY vs.recorded_at DESC
      LIMIT $2
    `, [id, parseInt(limit)]);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /vitals/history error:', err);
    res.status(500).json({ error: 'Failed to fetch vitals history' });
  }
});

// POST /patients/:id/vitals - standalone vitals entry (without a full note)
router.post('/:id/vitals', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate } = req.body;

  if (!hr && !systolic_bp && !spo2) {
    return res.status(400).json({ error: 'At least one vital value required' });
  }

  try {
    const encRes = await query(
      'SELECT id FROM encounters WHERE patient_id = $1 AND is_active = true LIMIT 1',
      [id]
    );
    const encounterId = encRes.rows[0]?.id;

    const result = await query(`
      INSERT INTO vital_snapshots
        (patient_id, encounter_id, hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_by_user_id, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual')
      RETURNING *
    `, [id, encounterId,
        hr||null, systolic_bp||null, diastolic_bp||null, rr||null,
        spo2||null, temp_c||null, uop_ml||null, glucose||null, lactate||null, userId]);

    // Timeline event
    await query(`
      INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary)
      VALUES ($1,$2,'vital_update',$3,'Vitals updated manually')
    `, [id, encounterId, userId]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /vitals error:', err);
    res.status(500).json({ error: 'Failed to save vitals' });
  }
});

// POST /patients/:id/notes - Create round note
router.post('/:id/notes', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const {
    status_summary, intake_ml, output_ml, io_comment, exam_text,
    device_summary, labs_imaging_update, medication_notes, nutrition_notes,
    plan_24h, risk_override,
    // Optional vitals in the note
    hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate,
    // Optional flags
    new_flags = [],
    resolve_flags = [],
  } = req.body;

  try {
    // Get active encounter
    const encRes = await query(
      'SELECT id FROM encounters WHERE patient_id = $1 AND is_active = true LIMIT 1',
      [id]
    );
    const encounterId = encRes.rows[0]?.id;

    // Create note
    const noteRes = await query(`
      INSERT INTO round_notes (
        patient_id, encounter_id, created_by_user_id,
        status_summary, intake_ml, output_ml, io_comment, exam_text,
        device_summary, labs_imaging_update, medication_notes, nutrition_notes,
        plan_24h, risk_override
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [id, encounterId, userId, status_summary, intake_ml, output_ml, io_comment, exam_text,
        device_summary, labs_imaging_update, medication_notes, nutrition_notes, plan_24h,
        risk_override || null]);

    const note = noteRes.rows[0];

    // Save vitals if provided
    if (hr || systolic_bp || spo2) {
      await query(`
        INSERT INTO vital_snapshots (patient_id, encounter_id, hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [id, encounterId, hr||null, systolic_bp||null, diastolic_bp||null, rr||null, spo2||null, temp_c||null, uop_ml||null, glucose||null, lactate||null, userId]);
    }

    // Add new flags
    for (const flagType of new_flags) {
      await query(`
        INSERT INTO red_flags (patient_id, encounter_id, note_id, flag_type, severity, is_active, source_type, created_by_user_id)
        VALUES ($1,$2,$3,$4,'moderate',true,'manual',$5)
      `, [id, encounterId, note.id, flagType, userId]);
    }

    // Resolve flags
    for (const flagType of resolve_flags) {
      await query(
        `UPDATE red_flags SET is_active = false WHERE patient_id = $1 AND flag_type = $2 AND is_active = true`,
        [id, flagType]
      );
    }

    // Timeline event
    await query(`
      INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary, reference_type, reference_id)
      VALUES ($1,$2,'round_note',$3,$4,'round_note',$5)
    `, [id, encounterId, userId, status_summary?.slice(0, 120) || 'Round note added', note.id]);

    res.status(201).json(note);
  } catch (err) {
    console.error('POST /notes error:', err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// GET /patients/:id/devices
router.get('/:id/devices', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM devices WHERE patient_id = $1 ORDER BY inserted_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

module.exports = router;