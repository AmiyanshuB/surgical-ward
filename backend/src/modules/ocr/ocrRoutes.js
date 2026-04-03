const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const { query } = require('../../db/db');
const { authenticate } = require('../../common/authMiddleware');

const router = express.Router();
router.use(authenticate);

// Store image in memory (no disk write needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// POST /ocr/vitals - extract vitals from photo of paper register
router.post('/vitals', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    console.log(`OCR request: ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB)`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `You are a medical data extraction assistant. This is a photo of a surgical ward patient vitals register or chart.

Extract ALL vitals entries you can see. For each row/entry, extract:
- date (in YYYY-MM-DD format if possible, otherwise as written)
- time (HH:MM 24h format if visible, otherwise null)
- hr (heart rate, integer, beats per minute)
- systolic_bp (systolic blood pressure, integer, mmHg)
- diastolic_bp (diastolic blood pressure, integer, mmHg)
- rr (respiratory rate, integer, breaths per minute)
- spo2 (oxygen saturation, number, percentage 0-100)
- temp_c (temperature in Celsius, number - convert from F if needed: (F-32)*5/9)
- uop_ml (urine output in ml, integer)
- glucose (blood glucose, number, mmol/L - if in mg/dL divide by 18)
- lactate (lactate level, number, mmol/L)

Rules:
- Only extract values you can actually read. Use null for anything unclear or not present.
- If BP is written as "120/80", systolic=120 diastolic=80.
- If temperature looks like it is in Fahrenheit (e.g. 98.6, 99, 100, 101), convert to Celsius.
- If date is unclear but you can infer relative dates (Day 1, Day 2 etc), use today as reference.
- Extract every row you can see, even partial ones.

Respond ONLY with a valid JSON array, no explanation, no markdown, no code blocks. Example:
[
  {"date":"2024-01-15","time":"08:00","hr":78,"systolic_bp":120,"diastolic_bp":80,"rr":16,"spo2":98,"temp_c":37.1,"uop_ml":350,"glucose":5.4,"lactate":1.2},
  {"date":"2024-01-16","time":"08:30","hr":82,"systolic_bp":115,"diastolic_bp":75,"rr":18,"spo2":97,"temp_c":37.3,"uop_ml":300,"glucose":null,"lactate":null}
]

If you cannot read any vitals at all, return an empty array: []`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return res.status(502).json({ error: 'Vision API error', detail: errText });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '[]';

    console.log('Claude raw response:', rawText.slice(0, 200));

    // Parse JSON from response
    let vitalsRows = [];
    try {
      const clean = rawText.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      vitalsRows = JSON.parse(clean);
      if (!Array.isArray(vitalsRows)) vitalsRows = [];
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', parseErr.message);
      return res.status(422).json({
        error: 'Could not parse vitals from image',
        raw: rawText,
      });
    }

    console.log(`OCR extracted ${vitalsRows.length} rows`);
    res.json({ rows: vitalsRows, count: vitalsRows.length });

  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'OCR processing failed', detail: err.message });
  }
});

// POST /ocr/vitals/save - save confirmed OCR rows to DB for a specific patient
router.post('/vitals/save', async (req, res) => {
  const { patient_id, rows } = req.body;
  const userId = req.user.id;

  if (!patient_id || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'patient_id and rows[] required' });
  }

  try {
    // Get active encounter
    const encRes = await query(
      'SELECT id FROM encounters WHERE patient_id = $1 AND is_active = true LIMIT 1',
      [patient_id]
    );
    const encounterId = encRes.rows[0]?.id;

    const toInt = v => (v === '' || v == null || isNaN(parseInt(v))) ? null : parseInt(v);
    const toFloat = v => (v === '' || v == null || isNaN(parseFloat(v))) ? null : parseFloat(v);

    let savedCount = 0;
    const errors = [];

    for (const row of rows) {
      try {
        // Build recorded_at from date + time
        let recordedAt = null;
        if (row.date) {
          const timeStr = row.time || '08:00';
          recordedAt = new Date(`${row.date}T${timeStr}:00`).toISOString();
        }

        await query(`
          INSERT INTO vital_snapshots
            (patient_id, encounter_id, recorded_at, hr, systolic_bp, diastolic_bp,
             rr, spo2, temp_c, uop_ml, glucose, lactate, source, recorded_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ocr',$13)
        `, [
          patient_id, encounterId,
          recordedAt,
          toInt(row.hr), toInt(row.systolic_bp), toInt(row.diastolic_bp),
          toInt(row.rr), toFloat(row.spo2), toFloat(row.temp_c),
          toInt(row.uop_ml), toFloat(row.glucose), toFloat(row.lactate),
          userId,
        ]);
        savedCount++;
      } catch (rowErr) {
        errors.push({ row, error: rowErr.message });
      }
    }

    // Timeline event
    if (savedCount > 0) {
      await query(`
        INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary)
        VALUES ($1, $2, 'vital_update', $3, $4)
      `, [patient_id, encounterId, userId, `${savedCount} historical vital readings imported from register photo`]);
    }

    res.json({ saved: savedCount, errors });
  } catch (err) {
    console.error('OCR save error:', err.message);
    res.status(500).json({ error: 'Failed to save vitals', detail: err.message });
  }
});

module.exports = router;