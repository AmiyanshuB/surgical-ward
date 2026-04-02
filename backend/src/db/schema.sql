-- Surgical Ward Patient Monitoring System - Database Schema

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'doctor', 'consultant')),
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  patient_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  age INTEGER NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  bed_number VARCHAR(20) NOT NULL,
  diagnosis TEXT,
  surgery_name VARCHAR(255),
  consultant_name VARCHAR(255),
  team_name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encounters (admissions)
CREATE TABLE IF NOT EXISTS encounters (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  admission_date DATE NOT NULL,
  surgery_date DATE,
  ward_name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  discharge_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vital Snapshots
CREATE TABLE IF NOT EXISTS vital_snapshots (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  hr INTEGER,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  rr INTEGER,
  spo2 DECIMAL(5,2),
  temp_c DECIMAL(4,1),
  uop_ml INTEGER,
  glucose DECIMAL(6,2),
  lactate DECIMAL(5,2),
  source VARCHAR(50) DEFAULT 'manual',
  recorded_by_user_id INTEGER REFERENCES users(id)
);

-- Round Notes
CREATE TABLE IF NOT EXISTS round_notes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status_summary TEXT,
  intake_ml INTEGER,
  output_ml INTEGER,
  io_comment TEXT,
  exam_text TEXT,
  device_summary TEXT,
  labs_imaging_update TEXT,
  medication_notes TEXT,
  nutrition_notes TEXT,
  plan_24h TEXT,
  risk_override VARCHAR(20) CHECK (risk_override IN ('red', 'yellow', 'green', NULL)),
  is_amended BOOLEAN DEFAULT FALSE
);

-- Red Flags
CREATE TABLE IF NOT EXISTS red_flags (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  note_id INTEGER REFERENCES round_notes(id),
  flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN (
    'hypotension','tachycardia','sepsis_concern','respiratory_distress',
    'bleeding','low_urine_output','neurological_change','device_issue',
    'infection_concern','other'
  )),
  severity VARCHAR(20) DEFAULT 'moderate' CHECK (severity IN ('mild','moderate','severe')),
  is_active BOOLEAN DEFAULT TRUE,
  source_type VARCHAR(20) DEFAULT 'manual' CHECK (source_type IN ('auto', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_user_id INTEGER REFERENCES users(id)
);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  device_type VARCHAR(50) NOT NULL CHECK (device_type IN (
    'foley_catheter','iv_line','central_line','drain','ng_tube','other'
  )),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'removed', 'replaced')),
  quantity INTEGER DEFAULT 1,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  notes TEXT
);

-- Timeline Events
CREATE TABLE IF NOT EXISTS timeline_events (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  encounter_id INTEGER REFERENCES encounters(id),
  event_type VARCHAR(50) NOT NULL,
  event_time TIMESTAMPTZ DEFAULT NOW(),
  actor_user_id INTEGER REFERENCES users(id),
  summary TEXT,
  reference_type VARCHAR(50),
  reference_id INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_vital_snapshots_patient ON vital_snapshots(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_notes_patient ON round_notes(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_flags_patient ON red_flags(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_timeline_patient ON timeline_events(patient_id, event_time DESC);
