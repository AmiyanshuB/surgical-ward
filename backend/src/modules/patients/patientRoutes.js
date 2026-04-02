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

// GET /patients/active - Dashboard list
router.get('/active', async (req, res) => {
  try {
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

    const patients = [];
    for (const row of patientsResult.rows) {
      const vitals = await getLatestVitals(row.id);
      const flags = await getActiveFlags(row.id);
      const flagTypes = flags.map(f => f.flag_type);

      // Get latest note override
      const noteRes = await query(
        'SELECT risk_override FROM round_notes WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
        [row.id]
      );
      const riskOverride = noteRes.rows[0]?.risk_override || null;

      // Get devices
      const devRes = await query(
        'SELECT device_type FROM devices WHERE patient_id = $1 AND status = $2',
        [row.id, 'active']
      );

      const riskResult = evaluateRisk({
        hr: vitals?.hr,
        systolic_bp: vitals?.systolic_bp,
        spo2: parseFloat(vitals?.spo2),
        rr: vitals?.rr,
        temp_c: parseFloat(vitals?.temp_c),
        lactate: parseFloat(vitals?.lactate),
        glucose: parseFloat(vitals?.glucose),
        active_flags: flagTypes,
        risk_override: riskOverride,
      });

      // Latest note summary
      const latestNoteRes = await query(
        'SELECT status_summary, created_at FROM round_notes WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
        [row.id]
      );

      patients.push({
        ...row,
        vitals,
        active_flags: flags,
        devices: devRes.rows.map(d => d.device_type),
        risk: riskResult.risk_level,
        risk_reasons: riskResult.reasons,
        latest_note_summary: latestNoteRes.rows[0]?.status_summary || null,
        latest_note_at: latestNoteRes.rows[0]?.created_at || null,
      });
    }

    res.json(patients);
  } catch (err) {
    console.error('GET /patients/active error:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /patients/:id - Full patient detail
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patRes = await query(`
      SELECT p.*, e.id AS encounter_id, e.admission_date, e.surgery_date, e.ward_name,
             COALESCE(CURRENT_DATE - e.surgery_date, 0) AS pod
      FROM patients p
      LEFT JOIN encounters e ON e.patient_id = p.id AND e.is_active = true
      WHERE p.id = $1
    `, [id]);

    if (!patRes.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    const patient = patRes.rows[0];
    const vitals = await getLatestVitals(id);
    const flags = await getActiveFlags(id);
    const flagTypes = flags.map(f => f.flag_type);

    const noteRes = await query(
      'SELECT risk_override FROM round_notes WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );
    const riskOverride = noteRes.rows[0]?.risk_override || null;

    const riskResult = evaluateRisk({
      hr: vitals?.hr, systolic_bp: vitals?.systolic_bp, spo2: parseFloat(vitals?.spo2),
      rr: vitals?.rr, temp_c: parseFloat(vitals?.temp_c), lactate: parseFloat(vitals?.lactate),
      glucose: parseFloat(vitals?.glucose), active_flags: flagTypes, risk_override: riskOverride,
    });

    const devRes = await query(
      'SELECT * FROM devices WHERE patient_id = $1 AND status = $2 ORDER BY inserted_at DESC',
      [id, 'active']
    );

    const recentNotesRes = await query(
      `SELECT rn.*, u.full_name AS author_name 
       FROM round_notes rn
       LEFT JOIN users u ON u.id = rn.created_by_user_id
       WHERE rn.patient_id = $1 ORDER BY rn.created_at DESC LIMIT 5`,
      [id]
    );

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
    res.status(500).json({ error: 'Failed to fetch patient' });
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