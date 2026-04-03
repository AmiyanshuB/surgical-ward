const express = require('express');
const multer = require('multer');
const https = require('https');
const { query } = require('../../db/db');
const { authenticate } = require('../../common/authMiddleware');

const router = express.Router();
router.use(authenticate);

// Store image in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// Helper: call Anthropic API using native https (no node-fetch needed)
function callAnthropic(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(90000, () => {
      req.destroy(new Error('Anthropic API request timed out after 90s'));
    });
    req.write(payload);
    req.end();
  });
}

// POST /ocr/vitals - extract vitals from photo
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

    console.log(`OCR request: ${req.file.originalname || 'image'} (${(req.file.size / 1024).toFixed(0)}KB)`);

    const result = await callAnthropic(apiKey, {
      model: 'claude-sonnet-4-5',
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
- date (YYYY-MM-DD format)
- time (HH:MM 24h format, null if not visible)
- hr (heart rate integer, bpm)
- systolic_bp (integer, mmHg)
- diastolic_bp (integer, mmHg)
- rr (respiratory rate integer, /min)
- spo2 (number, %)
- temp_c (number in Celsius — convert from F if needed: (F-32)*5/9)
- uop_ml (urine output integer, ml)
- glucose (number, mmol/L — if in mg/dL divide by 18)
- lactate (number, mmol/L)

Rules:
- Use null for anything unclear or not present.
- If BP is written as 120/80, systolic=120 diastolic=80.
- Extract every row you can see, even partial ones.
- If year is not shown, assume 2024.

Respond ONLY with a valid JSON array, no explanation, no markdown, no code blocks. Example:
[{"date":"2024-01-15","time":"08:00","hr":78,"systolic_bp":120,"diastolic_bp":80,"rr":16,"spo2":98,"temp_c":37.1,"uop_ml":350,"glucose":5.4,"lactate":1.2}]

If no vitals found, return: []`,
            },
          ],
        },
      ],
    });

    console.log(`Anthropic response status: ${result.status}`);

    if (result.status !== 200) {
      console.error('Anthropic API error:', JSON.stringify(result.body));
      const errMsg = result.body?.error?.message || JSON.stringify(result.body);
      return res.status(502).json({ error: `Vision API error: ${errMsg}` });
    }

    const rawText = result.body?.content?.[0]?.text || '[]';
    console.log('Claude response preview:', rawText.slice(0, 150));

    let vitalsRows = [];
    try {
      const clean = rawText.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      vitalsRows = JSON.parse(clean);
      if (!Array.isArray(vitalsRows)) vitalsRows = [];
    } catch (parseErr) {
      console.error('JSON parse failed:', parseErr.message, '| raw:', rawText.slice(0, 200));
      return res.status(422).json({
        error: 'Could not parse vitals from image. Try a clearer photo.',
        raw: rawText.slice(0, 300),
      });
    }

    console.log(`OCR extracted ${vitalsRows.length} rows`);
    res.json({ rows: vitalsRows, count: vitalsRows.length });

  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'OCR processing failed', detail: err.message });
  }
});

// POST /ocr/vitals/save - save confirmed rows to DB
router.post('/vitals/save', async (req, res) => {
  const { patient_id, rows } = req.body;
  const userId = req.user.id;

  if (!patient_id || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'patient_id and rows[] required' });
  }

  try {
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
          patient_id, encounterId, recordedAt,
          toInt(row.hr), toInt(row.systolic_bp), toInt(row.diastolic_bp),
          toInt(row.rr), toFloat(row.spo2), toFloat(row.temp_c),
          toInt(row.uop_ml), toFloat(row.glucose), toFloat(row.lactate),
          userId,
        ]);
        savedCount++;
      } catch (rowErr) {
        console.error('Row save error:', rowErr.message);
        errors.push({ row, error: rowErr.message });
      }
    }

    if (savedCount > 0) {
      await query(`
        INSERT INTO timeline_events (patient_id, encounter_id, event_type, actor_user_id, summary)
        VALUES ($1, $2, 'vital_update', $3, $4)
      `, [patient_id, encounterId, userId,
          `${savedCount} historical vital reading${savedCount > 1 ? 's' : ''} imported from register photo`]);
    }

    res.json({ saved: savedCount, errors });
  } catch (err) {
    console.error('OCR save error:', err.message);
    res.status(500).json({ error: 'Failed to save vitals', detail: err.message });
  }
});

module.exports = router;