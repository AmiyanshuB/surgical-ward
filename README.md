# Surgical Ward Patient Monitoring System

A doctor-first clinical operations tool for surgical wards. Built for speed, clarity, and low-friction round documentation.

## Core Flow
```
Dashboard → Click Patient → Patient Detail → Add Note → Save → Timeline Update
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
```

```bash
# Frontend
cd frontend
cp .env.example .env
# Edit .env — REACT_APP_API_URL=http://localhost:4000
```

### 3. Setup Database

```bash
cd backend

# Create the database first (run in psql)
# CREATE DATABASE surgical_ward;

# Run migrations
npm run migrate

# Seed demo data
npm run seed
```

### 4. Start the App

Terminal 1 — Backend:
```bash
cd backend
npm run dev
# API running on http://localhost:4000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm start
# App running on http://localhost:3000
```

Open http://localhost:3000

---

## Demo Login Credentials

| Role        | Email                        | Password    |
|-------------|------------------------------|-------------|
| Doctor      | priya.mehta@ward.local       | doctor123   |
| Consultant  | consultant@ward.local        | consult123  |
| Admin       | admin@ward.local             | admin123    |

Click the demo quick-fill buttons on the login page.

---

## What's Loaded in Demo

- **10 patients** across Red/Yellow/Green risk groups
- **2 teams** (Team A and Team B)
- **Multiple red flags** — hypotension, low UOP, sepsis concern, respiratory distress
- **Devices** — Foley catheters, drains, IV lines, central lines
- **Round notes** for each patient
- **Timeline events** — admission, surgery, and notes
- **Multi-day history** on Patient P001

---

## Features

### Dashboard (War Room)
- All active patients grouped by Red / Yellow / Green risk
- Patient cards with compact vitals, flags, and devices
- Collapsible risk sections with counts
- Search by name or bed number
- Filter by team
- Auto-refresh every 60 seconds + manual refresh button

### Patient Detail
- Full header: name, bed, POD, risk badge
- Vitals grid with color-coded abnormalities
- I/O balance with commentary
- Active red flags
- Active devices
- Recent notes (latest 5)
- Labs/medications sidebar from most recent note
- Full chronological timeline

### Round Note Form (Add Note)
Tabbed interface with:
1. **Status** — overall summary, examination, device notes
2. **Vitals & I/O** — full vitals entry, intake/output
3. **Clinical** — labs/imaging, medications, nutrition
4. **Flags** — add new clinical flags, resolve existing flags, risk override
5. **Plan** — 24-hour care plan

### Admin Panel
- All patients (active + discharged) in table view
- Admit new patients
- Discharge patients
- Add new users (admin only)
- Toggle user active/inactive

### Risk Engine
Centralized in `backend/src/modules/risk/riskEngine.js`. Returns:
- `risk_level`: red / yellow / green
- `reasons[]`: human-readable reasons
- `last_evaluated_at`: timestamp

Red thresholds: HR>125, SpO2<90, SBP<90, RR>25, Temp≥38.5°C, Lactate>4  
Yellow thresholds: HR>100 or <50, SpO2<94, SBP<100, RR>20, Temp≥38°C, Lactate>2

Clinician manual override always takes precedence.

---

## Architecture

```
surgical-ward/
├── backend/
│   └── src/
│       ├── db/           # PostgreSQL connection, migration, seed
│       ├── common/       # Auth middleware
│       └── modules/
│           ├── auth/     # JWT login
│           ├── patients/ # Core patient CRUD + notes API
│           ├── risk/     # Risk engine (centralized)
│           └── admin/    # Patient + user management
│
└── frontend/
    └── src/
        ├── components/
        │   ├── layout/   # AppLayout sidebar
        │   └── ui/       # Shared: RiskBadge, VitalBox, FlagBadge, DeviceIcon
        ├── features/
        │   ├── auth/     # Login page, AuthContext
        │   ├── dashboard/# War room dashboard
        │   ├── patients/ # Patient detail page
        │   ├── notes/    # Add note modal
        │   └── admin/    # Admin panel
        ├── lib/          # Axios API client
        └── routes/       # ProtectedRoute
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Authenticate user |
| GET | /patients/active | Dashboard patient list with risk |
| GET | /patients/:id | Full patient detail |
| GET | /patients/:id/timeline | Chronological events |
| GET | /patients/:id/vitals/latest | Latest vitals |
| POST | /patients/:id/notes | Create round note |
| GET | /patients/:id/devices | Active devices |
| GET | /admin/patients | All patients (admin/consultant) |
| POST | /admin/patients | Admit new patient |
| PATCH | /admin/patients/:id | Update/discharge patient |
| GET | /admin/users | All users (admin) |
| POST | /admin/users | Create user (admin) |
| PATCH | /admin/users/:id | Toggle user active (admin) |

## Tech Stack
- **Frontend:** React 18, Tailwind CSS, React Router v6, TanStack Query
- **Backend:** Node.js, Express, node-postgres
- **Database:** PostgreSQL
- **Auth:** JWT (24h expiry)
- **Fonts:** IBM Plex Sans + IBM Plex Mono

## Out of Scope (MVP)
- Billing, pharmacy, insurance
- Full EMR/HIS integration
- Real-time WebSocket updates (refresh-based in v1)
- Print/export
- Nurse access
- Patient portal
