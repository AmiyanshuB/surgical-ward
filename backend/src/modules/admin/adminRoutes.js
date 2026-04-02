const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../../db/db');
const { authenticate, requireRole } = require('../../common/authMiddleware');

const router = express.Router();
router.use(authenticate);

// GET /admin/patients - all patients including discharged
router.get('/patients', requireRole('admin', 'consultant'), async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, e.admission_date, e.surgery_date, e.ward_name,
             COALESCE(CURRENT_DATE - e.surgery_date, 0) AS pod
      FROM patients p
      LEFT JOIN encounters e ON e.patient_id = p.id AND e.is_active = true
      ORDER BY p.status, p.bed_number
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// POST /admin/patients - create new patient
router.post('/patients', requireRole('admin', 'doctor', 'consultant'), async (req, res) => {
  const {
    full_name, age, gender, bed_number, diagnosis, surgery_name,
    consultant_name, team_name, admission_date, surgery_date, ward_name
  } = req.body;

  if (!full_name || !age || !gender || !bed_number) {
    return res.status(400).json({ error: 'full_name, age, gender, bed_number are required' });
  }

  try {
    // Generate patient code
    const countRes = await query('SELECT COUNT(*) FROM patients');
    const count = parseInt(countRes.rows[0].count) + 1;
    const patient_code = `P${String(count).padStart(3, '0')}`;

    const patRes = await query(`
      INSERT INTO patients (patient_code, full_name, age, gender, bed_number, diagnosis, surgery_name, consultant_name, team_name, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
      RETURNING *
    `, [patient_code, full_name, age, gender, bed_number, diagnosis || null, surgery_name || null, consultant_name || null, team_name || null]);

    const patient = patRes.rows[0];

    // Create encounter
    const encRes = await query(`
      INSERT INTO encounters (patient_id, admission_date, surgery_date, ward_name, is_active)
      VALUES ($1,$2,$3,$4,true)
      RETURNING *
    `, [patient.id, admission_date || new Date().toISOString().split('T')[0], surgery_date || null, ward_name || 'Surgical Ward A']);

    // Timeline
    await query(`
      INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary)
      VALUES ($1,$2,'admission',$3,'Patient admitted to ward')
    `, [patient.id, encRes.rows[0].id, req.user.id]);

    res.status(201).json({ ...patient, encounter: encRes.rows[0] });
  } catch (err) {
    console.error('POST /admin/patients error:', err);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// PATCH /admin/patients/:id - update patient or discharge
router.patch('/patients/:id', requireRole('admin', 'doctor', 'consultant'), async (req, res) => {
  const { id } = req.params;
  const { status, bed_number, consultant_name, team_name, diagnosis } = req.body;

  try {
    const fields = [];
    const vals = [];
    let i = 1;

    if (status) { fields.push(`status = $${i++}`); vals.push(status); }
    if (bed_number) { fields.push(`bed_number = $${i++}`); vals.push(bed_number); }
    if (consultant_name) { fields.push(`consultant_name = $${i++}`); vals.push(consultant_name); }
    if (team_name) { fields.push(`team_name = $${i++}`); vals.push(team_name); }
    if (diagnosis) { fields.push(`diagnosis = $${i++}`); vals.push(diagnosis); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    fields.push(`updated_at = NOW()`);
    vals.push(id);

    const result = await query(
      `UPDATE patients SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Patient not found' });

    // If discharged, close encounter
    if (status === 'discharged') {
      await query(
        `UPDATE encounters SET is_active = false, discharge_date = CURRENT_DATE WHERE patient_id = $1 AND is_active = true`,
        [id]
      );
      const encRes = await query('SELECT id FROM encounters WHERE patient_id = $1 ORDER BY id DESC LIMIT 1', [id]);
      await query(`
        INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary)
        VALUES ($1,$2,'discharge',$3,'Patient discharged')
      `, [id, encRes.rows[0]?.id, req.user.id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /admin/patients/:id error:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// GET /admin/users
router.get('/users', requireRole('admin'), async (req, res) => {
  try {
    const result = await query('SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY role, full_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /admin/users
router.post('/users', requireRole('admin'), async (req, res) => {
  const { full_name, email, role, password } = req.body;
  if (!full_name || !email || !role || !password) {
    return res.status(400).json({ error: 'full_name, email, role, password required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(`
      INSERT INTO users (full_name, email, role, password_hash)
      VALUES ($1,$2,$3,$4)
      RETURNING id, full_name, email, role, is_active, created_at
    `, [full_name, email.toLowerCase().trim(), role, hash]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /admin/users/:id
router.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { is_active, role } = req.body;
  try {
    const fields = [], vals = [];
    let i = 1;
    if (is_active !== undefined) { fields.push(`is_active = $${i++}`); vals.push(is_active); }
    if (role) { fields.push(`role = $${i++}`); vals.push(role); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING id, full_name, email, role, is_active`,
      vals
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

module.exports = router;
