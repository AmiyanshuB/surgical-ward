require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const mockPatients = [
  { code: 'P001', name: 'Aarav Sharma', age: 30, gender: 'male', bed: 'B-01', surgery: 'Exploratory laparotomy', pod: 2, risk: 'red', vitals: { hr: 79, bp: '117/76', spo2: 97, rr: 17, temp_c: 37.0 }, flags: ['hypotension'], devices: ['foley_catheter', 'drain'], team: 'Team A' },
  { code: 'P002', name: 'Vikram Singh', age: 34, gender: 'female', bed: 'B-02', surgery: 'Appendectomy', pod: 3, risk: 'yellow', vitals: { hr: 84, bp: '116/75', spo2: 96, rr: 18, temp_c: 37.2 }, flags: ['low_urine_output'], devices: ['iv_line'], team: 'Team A' },
  { code: 'P003', name: 'Rohan Mehta', age: 38, gender: 'male', bed: 'B-03', surgery: 'Exploratory laparotomy', pod: 4, risk: 'green', vitals: { hr: 89, bp: '115/75', spo2: 95, rr: 19, temp_c: 36.8 }, flags: [], devices: ['foley_catheter', 'drain'], team: 'Team A' },
  { code: 'P004', name: 'Kabir Jain', age: 42, gender: 'female', bed: 'B-04', surgery: 'Appendectomy', pod: 5, risk: 'red', vitals: { hr: 94, bp: '114/74', spo2: 98, rr: 20, temp_c: 37.0 }, flags: ['hypotension'], devices: ['iv_line'], team: 'Team A' },
  { code: 'P005', name: 'Arjun Patel', age: 46, gender: 'male', bed: 'B-05', surgery: 'Exploratory laparotomy', pod: 1, risk: 'yellow', vitals: { hr: 99, bp: '113/74', spo2: 97, rr: 16, temp_c: 37.2 }, flags: ['low_urine_output'], devices: ['foley_catheter', 'drain'], team: 'Team A' },
  { code: 'P006', name: 'Saanvi Verma', age: 50, gender: 'female', bed: 'B-06', surgery: 'Appendectomy', pod: 2, risk: 'green', vitals: { hr: 78, bp: '120/80', spo2: 99, rr: 14, temp_c: 36.8 }, flags: [], devices: ['iv_line'], team: 'Team B' },
  { code: 'P007', name: 'Ishita Rao', age: 54, gender: 'male', bed: 'B-07', surgery: 'Exploratory laparotomy', pod: 3, risk: 'red', vitals: { hr: 130, bp: '85/55', spo2: 88, rr: 26, temp_c: 38.8 }, flags: ['hypotension', 'sepsis_concern', 'respiratory_distress'], devices: ['foley_catheter', 'drain', 'central_line'], team: 'Team B' },
  { code: 'P008', name: 'Meera Nair', age: 58, gender: 'female', bed: 'B-08', surgery: 'Appendectomy', pod: 4, risk: 'yellow', vitals: { hr: 105, bp: '110/72', spo2: 94, rr: 22, temp_c: 38.0 }, flags: ['low_urine_output', 'infection_concern'], devices: ['iv_line', 'foley_catheter'], team: 'Team B' },
  { code: 'P009', name: 'Ananya Gupta', age: 62, gender: 'male', bed: 'B-09', surgery: 'Exploratory laparotomy', pod: 5, risk: 'green', vitals: { hr: 72, bp: '125/80', spo2: 98, rr: 15, temp_c: 36.6 }, flags: [], devices: ['foley_catheter', 'drain'], team: 'Team B' },
  { code: 'P010', name: 'Diya Kapoor', age: 66, gender: 'female', bed: 'B-10', surgery: 'Appendectomy', pod: 1, risk: 'green', vitals: { hr: 76, bp: '118/76', spo2: 97, rr: 16, temp_c: 36.9 }, flags: [], devices: ['iv_line'], team: 'Team B' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data in correct order
    await client.query('DELETE FROM timeline_events');
    await client.query('DELETE FROM red_flags');
    await client.query('DELETE FROM devices');
    await client.query('DELETE FROM round_notes');
    await client.query('DELETE FROM vital_snapshots');
    await client.query('DELETE FROM encounters');
    await client.query('DELETE FROM patients');
    await client.query('DELETE FROM users');

    // Reset sequences
    await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE patients_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE encounters_id_seq RESTART WITH 1');

    // Seed users
    const adminHash = await bcrypt.hash('admin123', 10);
    const doctorHash = await bcrypt.hash('doctor123', 10);
    const consultHash = await bcrypt.hash('consult123', 10);

    const usersResult = await client.query(`
      INSERT INTO users (full_name, email, role, password_hash) VALUES
        ('Admin User', 'admin@ward.local', 'admin', $1),
        ('Dr. Priya Mehta', 'priya.mehta@ward.local', 'doctor', $2),
        ('Dr. Rajesh Kumar', 'rajesh.kumar@ward.local', 'doctor', $2),
        ('Dr. Surgical Lead', 'consultant@ward.local', 'consultant', $3)
      RETURNING id, email
    `, [adminHash, doctorHash, consultHash]);

    const doctorId = usersResult.rows[1].id;
    const consultId = usersResult.rows[3].id;
    console.log('✅ Users seeded');

    // Seed patients + encounters + vitals + flags + devices + notes
    for (let i = 0; i < mockPatients.length; i++) {
      const p = mockPatients[i];
      const [sysStr, diaStr] = p.vitals.bp.split('/');
      const sys = parseInt(sysStr);
      const dia = parseInt(diaStr);

      // Patient
      const patRes = await client.query(`
        INSERT INTO patients (patient_code, full_name, age, gender, bed_number, diagnosis, surgery_name, consultant_name, team_name, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
        RETURNING id
      `, [p.code, p.name, p.age, p.gender, p.bed, 'Post-operative surgical care', p.surgery, 'Dr. Surgical Lead', p.team]);

      const patientId = patRes.rows[0].id;

      // Encounter — admission and surgery dates based on POD
      const surgeryDate = new Date();
      surgeryDate.setDate(surgeryDate.getDate() - p.pod);
      const admissionDate = new Date(surgeryDate);
      admissionDate.setDate(admissionDate.getDate() - 1);

      const encRes = await client.query(`
        INSERT INTO encounters (patient_id, admission_date, surgery_date, ward_name, is_active)
        VALUES ($1, $2, $3, 'Surgical Ward A', true)
        RETURNING id
      `, [patientId, admissionDate.toISOString().split('T')[0], surgeryDate.toISOString().split('T')[0]]);

      const encounterId = encRes.rows[0].id;

      // Vitals
      const vitRes = await client.query(`
        INSERT INTO vital_snapshots (patient_id, encounter_id, hr, systolic_bp, diastolic_bp, rr, spo2, temp_c, uop_ml, glucose, lactate, recorded_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [patientId, encounterId, p.vitals.hr, sys, dia, p.vitals.rr, p.vitals.spo2, p.vitals.temp_c,
          Math.floor(Math.random() * 400) + 200, (Math.random() * 3 + 4).toFixed(1), (Math.random() * 1.5 + 0.5).toFixed(1), doctorId]);

      // Red flags
      for (const flagType of p.flags) {
        const severity = p.risk === 'red' ? 'severe' : 'moderate';
        await client.query(`
          INSERT INTO red_flags (patient_id, encounter_id, flag_type, severity, is_active, source_type, created_by_user_id)
          VALUES ($1, $2, $3, $4, true, 'manual', $5)
        `, [patientId, encounterId, flagType, severity, doctorId]);
      }

      // Devices
      for (const devType of p.devices) {
        await client.query(`
          INSERT INTO devices (patient_id, encounter_id, device_type, status)
          VALUES ($1, $2, $3, 'active')
        `, [patientId, encounterId, devType]);
      }

      // Round note
      const noteRes = await client.query(`
        INSERT INTO round_notes (patient_id, encounter_id, created_by_user_id, status_summary, intake_ml, output_ml, io_comment, exam_text, device_summary, labs_imaging_update, medication_notes, nutrition_notes, plan_24h, risk_override)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        patientId, encounterId, doctorId,
        `Patient reviewed on morning round. Overall condition ${p.risk === 'green' ? 'stable' : p.risk === 'yellow' ? 'requires monitoring' : 'critical - urgent review needed'}.`,
        Math.floor(Math.random() * 500) + 1000,
        Math.floor(Math.random() * 400) + 600,
        p.flags.length > 0 ? `Output monitored closely due to ${p.flags[0].replace(/_/g, ' ')}.` : 'I/O balanced.',
        `Abdomen ${p.risk === 'red' ? 'tender, guarded' : p.risk === 'yellow' ? 'mildly tender' : 'soft, non-tender'}. Wound ${p.risk === 'green' ? 'healing well' : 'reviewed'}.`,
        p.devices.map(d => d.replace(/_/g, ' ')).join(', ') + ' - all functional.',
        'CBC, RFT, LFT reviewed. ' + (p.risk === 'red' ? 'WBC elevated. Lactate rising.' : p.risk === 'yellow' ? 'Mild electrolyte imbalance noted.' : 'Within acceptable limits.'),
        'Continue current medications. ' + (p.risk === 'red' ? 'IV antibiotics escalated.' : ''),
        p.risk === 'green' ? 'Diet tolerating well. Encourage oral intake.' : 'NPO/restricted diet maintained.',
        p.risk === 'red' ? 'Urgent senior review. ICU consult if no improvement in 2h. Monitor q1h.' : p.risk === 'yellow' ? 'Close monitoring q4h. Repeat vitals. Senior review if deteriorates.' : 'Continue current management. Reassess tomorrow.',
        p.risk
      ]);

      const noteId = noteRes.rows[0].id;

      // Timeline events
      await client.query(`
        INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary, reference_type, reference_id)
        VALUES
          ($1, $2, 'admission', $3, 'Patient admitted to Surgical Ward A', 'encounter', $4),
          ($1, $2, 'surgery', $3, $5, 'encounter', $4),
          ($1, $2, 'round_note', $3, 'Morning round note added', 'round_note', $6)
      `, [patientId, encounterId, doctorId, encounterId, `${p.surgery} performed`, noteId]);

      console.log(`  ✅ Patient ${p.code} - ${p.name} seeded`);
    }

    // Add an older round note for first patient to show timeline
    const firstPatRes = await client.query('SELECT id FROM patients WHERE patient_code = $1', ['P001']);
    const firstEncRes = await client.query('SELECT id FROM encounters WHERE patient_id = $1', [firstPatRes.rows[0].id]);
    const p1Id = firstPatRes.rows[0].id;
    const e1Id = firstEncRes.rows[0].id;

    const oldNoteRes = await client.query(`
      INSERT INTO round_notes (patient_id, encounter_id, created_by_user_id, created_at, status_summary, plan_24h)
      VALUES ($1, $2, $3, NOW() - INTERVAL '24 hours', 'Post-op day 1 review. Patient alert, uncomfortable but stable. Wound dressing intact.', 'Monitor vitals q4h. Encourage ambulation. Pain management as charted.')
      RETURNING id
    `, [p1Id, e1Id, doctorId]);

    await client.query(`
      INSERT INTO timeline_events (patient_id, encounter_id, event_type, event_time, actor_user_id, summary, reference_type, reference_id)
      VALUES ($1, $2, 'round_note', NOW() - INTERVAL '24 hours', $3, 'Evening round note added', 'round_note', $4)
    `, [p1Id, e1Id, doctorId, oldNoteRes.rows[0].id]);

    await client.query('COMMIT');
    console.log('\n✅ Seed complete — 10 patients, demo users, notes, and timeline loaded');
    console.log('\nDemo login credentials:');
    console.log('  Doctor:     priya.mehta@ward.local / doctor123');
    console.log('  Consultant: consultant@ward.local / consult123');
    console.log('  Admin:      admin@ward.local / admin123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
