import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Spinner, formatDateTime } from '../../components/ui';
import VitalsOCRModal from './VitalsOCRModal';

// ─── Radar Chart (pure SVG, no library needed) ────────────────────────────────

const RADAR_METRICS = [
  {
    key: 'hr',
    label: 'Heart Rate',
    min: 0, max: 160,
    normalMin: 60, normalMax: 100,
    getValue: v => v?.hr,
    unit: 'bpm',
  },
  {
    key: 'spo2',
    label: 'SpO2',
    min: 80, max: 100,
    normalMin: 95, normalMax: 100,
    getValue: v => v?.spo2 != null ? parseFloat(v.spo2) : null,
    unit: '%',
  },
  {
    key: 'rr',
    label: 'Resp Rate',
    min: 0, max: 40,
    normalMin: 12, normalMax: 20,
    getValue: v => v?.rr,
    unit: '/min',
  },
  {
    key: 'temp',
    label: 'Temperature',
    min: 34, max: 41,
    normalMin: 36.1, normalMax: 37.5,
    getValue: v => v?.temp_c != null ? parseFloat(v.temp_c) : null,
    unit: '°C',
  },
  {
    key: 'sbp',
    label: 'Systolic BP',
    min: 60, max: 200,
    normalMin: 90, normalMax: 140,
    getValue: v => v?.systolic_bp,
    unit: 'mmHg',
  },
  {
    key: 'glucose',
    label: 'Glucose',
    min: 2, max: 20,
    normalMin: 4.0, normalMax: 7.8,
    getValue: v => v?.glucose != null ? parseFloat(v.glucose) : null,
    unit: 'mmol/L',
  },
];

// Normalize a value to 0–1 scale within min/max, with 1.0 = perfect center of normal range
function normalize(value, min, max, normalMin, normalMax) {
  if (value == null) return 0;
  const normalMid = (normalMin + normalMax) / 2;
  const range = max - min;
  // Score: how close to normal midpoint, mapped to 0-1 (1 = normal center, 0 = extreme)
  const dist = Math.abs(value - normalMid);
  const maxDist = Math.max(normalMid - min, max - normalMid);
  return Math.max(0, Math.min(1, 1 - dist / maxDist));
}

function isAbnormal(value, normalMin, normalMax, redMin, redMax) {
  if (value == null) return 'missing';
  if ((redMin && value < redMin) || (redMax && value > redMax)) return 'critical';
  if (value < normalMin || value > normalMax) return 'warning';
  return 'normal';
}

const RED_THRESHOLDS = {
  hr: { min: 40, max: 125 },
  spo2: { min: 90, max: null },
  rr: { min: null, max: 25 },
  temp: { min: 35, max: 38.5 },
  sbp: { min: 90, max: 180 },
  glucose: { min: 3, max: 15 },
};

function RadarChart({ vitals }) {
  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 100;
  const count = RADAR_METRICS.length;

  // Generate polygon points for a set of normalized values (0–1)
  const getPoints = (values) =>
    values.map((v, i) => {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      const r = v * R;
      return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
    });

  // Axis endpoints
  const axisPoints = RADAR_METRICS.map((_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return [CX + R * Math.cos(angle), CY + R * Math.sin(angle)];
  });

  // Label positions (slightly beyond axis end)
  const labelPoints = RADAR_METRICS.map((m, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = R + 28;
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
  });

  // Concentric grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Normal range polygon — map normal midpoint = 1.0
  const normalValues = RADAR_METRICS.map(() => 0.75); // normal zone at 75% of ring
  const normalPoints = getPoints(normalValues);

  // Patient values
  const patientNorms = RADAR_METRICS.map(m => normalize(
    m.getValue(vitals), m.min, m.max, m.normalMin, m.normalMax
  ));
  const patientPoints = getPoints(patientNorms);

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';

  const statusColors = {
    normal: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
    missing: '#94a3b8',
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Grid rings */}
        {rings.map((r, ri) => {
          const ringPts = RADAR_METRICS.map((_, i) => {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
            return [CX + R * r * Math.cos(angle), CY + R * r * Math.sin(angle)];
          });
          return (
            <path key={ri} d={toPath(ringPts)}
              fill="none" stroke="#e2e8f0" strokeWidth={r === 1 ? 1.5 : 1}
              strokeDasharray={r === 0.75 ? '4,3' : undefined} />
          );
        })}

        {/* Axis lines */}
        {axisPoints.map((p, i) => (
          <line key={i} x1={CX} y1={CY} x2={p[0]} y2={p[1]} stroke="#cbd5e1" strokeWidth={1} />
        ))}

        {/* Normal zone fill */}
        <path d={toPath(normalPoints)}
          fill="#10b98115" stroke="#10b98140" strokeWidth={1.5} strokeDasharray="4,3" />

        {/* Patient data polygon */}
        <path d={toPath(patientPoints)}
          fill="#3b82f620" stroke="#3b82f6" strokeWidth={2} />

        {/* Patient data points */}
        {patientPoints.map((p, i) => {
          const m = RADAR_METRICS[i];
          const val = m.getValue(vitals);
          const rt = RED_THRESHOLDS[m.key];
          const status = isAbnormal(val, m.normalMin, m.normalMax, rt?.min, rt?.max);
          return (
            <circle key={i} cx={p[0]} cy={p[1]} r={4}
              fill={statusColors[status]} stroke="white" strokeWidth={1.5} />
          );
        })}

        {/* Labels */}
        {RADAR_METRICS.map((m, i) => {
          const [lx, ly] = labelPoints[i];
          const val = m.getValue(vitals);
          const rt = RED_THRESHOLDS[m.key];
          const status = isAbnormal(val, m.normalMin, m.normalMax, rt?.min, rt?.max);
          const color = statusColors[status];
          const anchor = lx < CX - 5 ? 'end' : lx > CX + 5 ? 'start' : 'middle';
          return (
            <g key={i}>
              <text x={lx} y={ly - 6} textAnchor={anchor}
                fontSize="9" fontFamily="IBM Plex Sans, sans-serif"
                fontWeight="600" fill="#64748b" letterSpacing="0.05em">
                {m.label.toUpperCase()}
              </text>
              <text x={lx} y={ly + 6} textAnchor={anchor}
                fontSize="11" fontFamily="IBM Plex Mono, monospace"
                fontWeight="700" fill={color}>
                {val != null ? `${val}${m.unit}` : '—'}
              </text>
            </g>
          );
        })}

        {/* Center dot */}
        <circle cx={CX} cy={CY} r={3} fill="#cbd5e1" />
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-500 rounded" />
          Patient
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-400 rounded border-dashed" style={{ borderTop: '2px dashed #10b981', height: 0 }} />
          Normal zone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />Critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />Warning
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />Normal
        </span>
      </div>
    </div>
  );
}

// ─── Vitals History Table ──────────────────────────────────────────────────────

function VitalsHistoryTable({ rows }) {
  const COLS = [
    { label: 'Date/Time', render: r => formatDateTime(r.recorded_at), mono: false },
    { label: 'HR', key: 'hr', unit: 'bpm', normal: [60,100], critical: [40,125] },
    { label: 'BP', render: r => r.systolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '—', key: 'systolic_bp', normal: [90,140], critical: [80,180] },
    { label: 'SpO2', render: r => r.spo2 != null ? `${parseFloat(r.spo2)}%` : '—', key: 'spo2', normalMin: 95, criticalMin: 90 },
    { label: 'RR', key: 'rr', unit: '/min', normal: [12,20], critical: [8,25] },
    { label: 'Temp', render: r => r.temp_c != null ? `${parseFloat(r.temp_c)}°C` : '—', key: 'temp_c', normal: [36.1,37.5], critical: [35,38.5] },
    { label: 'UOP', render: r => r.uop_ml != null ? `${r.uop_ml}ml` : '—' },
    { label: 'Glucose', render: r => r.glucose != null ? `${parseFloat(r.glucose)}` : '—', key: 'glucose', normal: [4,7.8], critical: [3,15] },
    { label: 'Lactate', render: r => r.lactate != null ? `${parseFloat(r.lactate)}` : '—', key: 'lactate', normal: [0.5,2], critical: [null,4] },
    { label: 'By', render: r => r.recorded_by || '—', mono: false },
  ];

  function cellClass(row, col) {
    if (!col.key) return '';
    const val = parseFloat(row[col.key]);
    if (isNaN(val)) return '';
    const [clo, chi] = col.critical || [null, null];
    const [nlo, nhi] = col.normal || [null, null];
    if ((clo && val < clo) || (chi && val > chi)) return 'text-red-600 font-bold bg-red-50';
    if ((nlo && val < nlo) || (nhi && val > nhi)) return 'text-amber-600 font-semibold bg-amber-50';
    return 'text-emerald-700';
  }

  if (!rows.length) return <p className="text-slate-400 text-sm py-4 text-center">No vitals history recorded yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {COLS.map(c => (
              <th key={c.label} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={row.id || i} className={`hover:bg-slate-50 transition-colors ${i === 0 ? 'bg-blue-50/30' : ''}`}>
              {COLS.map(col => {
                const display = col.render ? col.render(row) : (row[col.key] != null ? `${row[col.key]}${col.unit || ''}` : '—');
                const extra = cellClass(row, col);
                return (
                  <td key={col.label} className={`px-3 py-2.5 font-mono ${i === 0 ? 'font-semibold' : ''} ${extra}`}>
                    {i === 0 && col.label === 'Date/Time'
                      ? <span className="flex items-center gap-1.5">{display} <span className="text-blue-500 text-xs font-sans font-semibold">LATEST</span></span>
                      : display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Vitals Form ───────────────────────────────────────────────────────────

function AddVitalsForm({ patientId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    hr: '', systolic_bp: '', diastolic_bp: '', rr: '',
    spo2: '', temp_c: '', uop_ml: '', glucose: '', lactate: ''
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const qc = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: data => api.post(`/patients/${patientId}/vitals`, data),
    onSuccess: () => {
      qc.invalidateQueries(['vitals-history', patientId]);
      qc.invalidateQueries(['patient', patientId]);
      setForm({ hr: '', systolic_bp: '', diastolic_bp: '', rr: '', spo2: '', temp_c: '', uop_ml: '', glucose: '', lactate: '' });
      setOpen(false);
      onSaved?.();
    },
  });

  const submit = () => {
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '') payload[k] = parseFloat(v) || parseInt(v) || null;
    });
    mutate(payload);
  };

  const fields = [
    { k: 'hr', label: 'HR', unit: 'bpm', placeholder: '72' },
    { k: 'systolic_bp', label: 'SBP', unit: 'mmHg', placeholder: '120' },
    { k: 'diastolic_bp', label: 'DBP', unit: 'mmHg', placeholder: '80' },
    { k: 'rr', label: 'RR', unit: '/min', placeholder: '16' },
    { k: 'spo2', label: 'SpO2', unit: '%', placeholder: '98' },
    { k: 'temp_c', label: 'Temp', unit: '°C', placeholder: '37.2' },
    { k: 'uop_ml', label: 'UOP', unit: 'ml', placeholder: '400' },
    { k: 'glucose', label: 'Glucose', unit: 'mmol/L', placeholder: '5.4' },
    { k: 'lactate', label: 'Lactate', unit: 'mmol/L', placeholder: '1.2' },
  ];

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Record New Vitals
      </button>

      {open && (
        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-slide-up">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {fields.map(({ k, label, unit, placeholder }) => (
              <div key={k}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  {label} <span className="text-slate-400 font-normal normal-case">({unit})</span>
                </label>
                <input type="number" step="any" value={form[k]} onChange={set(k)}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
              </div>
            ))}
          </div>
          {error && <p className="text-red-600 text-xs mb-2">{error.response?.data?.error || 'Failed to save'}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOpen(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
            <button onClick={submit} disabled={isPending} className="btn-primary text-xs py-1.5 px-3">
              {isPending ? 'Saving...' : 'Save Vitals'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function VitalsPanel({ patientId, patientName, latestVitals }) {
  const [view, setView] = useState('chart'); // 'chart' | 'history'
  const [showOCR, setShowOCR] = useState(false);
  const qc = useQueryClient();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['vitals-history', patientId],
    queryFn: () => api.get(`/patients/${patientId}/vitals/history?limit=60`).then(r => r.data),
  });

  return (
    <div className="section-card">
      <div className="section-header">
        <h3 className="section-title">Vitals Analytics</h3>
        <div className="flex items-center gap-2">
          {/* OCR import button */}
          <button
            onClick={() => setShowOCR(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors"
            title="Import vitals from a photo of the paper register"
          >
            <span>📷</span>
            Import from Photo
          </button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <button onClick={() => setView('chart')}
              className={`px-3 py-1.5 transition-colors ${view === 'chart' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              Radar Chart
            </button>
            <button onClick={() => setView('history')}
              className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${view === 'history' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              History ({history.length})
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {view === 'chart' && (
          <div>
            {latestVitals ? (
              <RadarChart vitals={latestVitals} />
            ) : (
              <p className="text-slate-400 text-sm text-center py-8">No vitals recorded yet</p>
            )}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <AddVitalsForm
                patientId={patientId}
                onSaved={() => qc.invalidateQueries(['patient', patientId])}
              />
            </div>
          </div>
        )}

        {view === 'history' && (
          <div>
            {isLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : (
              <VitalsHistoryTable rows={history} />
            )}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <AddVitalsForm
                patientId={patientId}
                onSaved={() => qc.invalidateQueries(['vitals-history', patientId])}
              />
            </div>
          </div>
        )}
      </div>

      {showOCR && (
        <VitalsOCRModal
          patientId={patientId}
          patientName={patientName}
          onClose={() => setShowOCR(false)}
          onSaved={() => {
            setShowOCR(false);
            setView('history');
            qc.invalidateQueries(['vitals-history', patientId]);
          }}
        />
      )}
    </div>
  );
}