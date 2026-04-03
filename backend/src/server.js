require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./modules/auth/authRoutes');
const patientRoutes = require('./modules/patients/patientRoutes');
const adminRoutes = require('./modules/admin/adminRoutes');
const ocrRoutes = require('./modules/ocr/ocrRoutes');

const app = express();

// CORS — completely open
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '15mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.path}`);
  res.on('finish', () => console.log(`  ← ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/patients', patientRoutes);
app.use('/admin', adminRoutes);
app.use('/ocr', ocrRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🏥 Surgical Ward API running on port ${PORT}`);
  console.log(`   OCR: ${process.env.ANTHROPIC_API_KEY ? '✅ enabled' : '❌ ANTHROPIC_API_KEY missing'}\n`);
});

module.exports = app;