import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { RiskBadge, FlagBadge, DeviceIcon, Spinner, formatDateTime } from '../../components/ui';

const RISK_CONFIG = {
  red:    { label: 'Critical', border: 'border-l-red-500', headerBg: 'bg-red-50', headerText: 'text-red-700', count: 'bg-red-100 text-red-700', emptyText: 'No critical patients' },
  yellow: { label: 'Watch Closely', border: 'border-l-amber-400', headerBg: 'bg-amber-50', headerText: 'text-amber-700', count: 'bg-amber-100 text-amber-700', emptyText: 'No watch patients' },
  green:  { label: 'Stable', border: 'border-l-emerald-500', headerBg: 'bg-emerald-50', headerText: 'text-emerald-700', count: 'bg-emerald-100 text-emerald-700', emptyText: 'No stable patients' },
};

function isVitalAbnormal(key, val) {
  if (val == null) return false;
  const thresholds = {
    hr: [50, 100], systolic_bp: [90, 140], spo2: [94, 100],
    rr: [12, 20], temp_c: [36.0, 38.0],
  };
  const [lo, hi] = thresholds[key] || [];
  return lo != null && (val < lo || val > hi);
}

function VitalPill({ label, value, unit, abnormal }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 font-mono font-medium ${
      abnormal ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'
    }`}>
      <span className="text-slate-400 font-sans font-normal">{label}</span>
      {value ?? '—'}{unit && <span className="opacity-60">{unit}</span>}
    </span>
  );
}

function PatientCard({ patient, onClick }) {
  const v = patient.vitals || {};
  const cfg = RISK_CONFIG[patient.risk] || RISK_CONFIG.green;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-l-4 ${cfg.border} border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-4 animate-slide-up`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
              {patient.bed_number}
            </span>
            <span className="font-semibold text-slate-900 text-sm truncate">{patient.full_name}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {patient.age}y · {patient.gender} · POD {patient.pod ?? '?'} · {patient.surgery_name}
          </div>
        </div>
        <RiskBadge level={patient.risk} />
      </div>

      {/* Vitals row */}
      <div className="flex flex-wrap gap-1 mb-3">
        <VitalPill label="HR " value={v.hr} unit=" bpm" abnormal={isVitalAbnormal('hr', v.hr)} />
        <VitalPill label="BP " value={v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : null} abnormal={isVitalAbnormal('systolic_bp', v.systolic_bp)} />
        <VitalPill label="SpO2 " value={v.spo2} unit="%" abnormal={isVitalAbnormal('spo2', parseFloat(v.spo2))} />
        <VitalPill label="RR " value={v.rr} unit="/m" abnormal={isVitalAbnormal('rr', v.rr)} />
        <VitalPill label="T " value={v.temp_c} unit="°C" abnormal={isVitalAbnormal('temp_c', parseFloat(v.temp_c))} />
      </div>

      {/* Flags + Devices */}
      {(patient.active_flags?.length > 0 || patient.devices?.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-3">
          {patient.active_flags?.slice(0, 3).map(f => (
            <FlagBadge key={f.flag_type || f} type={f.flag_type || f} />
          ))}
          {patient.devices?.slice(0, 2).map(d => (
            <DeviceIcon key={d} type={d} />
          ))}
        </div>
      )}

      {/* Note summary */}
      {patient.latest_note_summary && (
        <p className="text-xs text-slate-500 italic truncate border-t border-slate-100 pt-2">
          {patient.latest_note_summary}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-1">
        <span className="text-xs text-slate-400">{patient.team_name}</span>
        <span className="text-xs text-slate-300 font-mono">
          {patient.latest_note_at ? formatDateTime(patient.latest_note_at) : '—'}
        </span>
      </div>
    </div>
  );
}

function RiskSection({ level, patients, onPatientClick }) {
  const cfg = RISK_CONFIG[level];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-8">
      <div
        className={`flex items-center justify-between mb-3 px-4 py-2.5 rounded-lg ${cfg.headerBg} cursor-pointer`}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${level === 'red' ? 'bg-red-500' : level === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'} ${level === 'red' ? 'animate-pulse' : ''}`} />
          <span className={`font-semibold text-sm ${cfg.headerText}`}>{cfg.label}</span>
          <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${cfg.count}`}>
            {patients.length}
          </span>
        </div>
        <svg className={`w-4 h-4 ${cfg.headerText} transition-transform ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {patients.length === 0 ? (
            <p className="text-slate-400 text-sm col-span-full py-3">{cfg.emptyText}</p>
          ) : (
            patients.map(p => (
              <PatientCard key={p.id} patient={p} onClick={() => onPatientClick(p.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');

  const { data: patients = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['patients', 'active'],
    queryFn: () => api.get('/patients/active').then(r => r.data),
    refetchInterval: 60000,
  });

  const teams = ['all', ...new Set(patients.map(p => p.team_name).filter(Boolean))];

  const filtered = patients.filter(p => {
    const matchSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.bed_number.toLowerCase().includes(search.toLowerCase());
    const matchTeam = teamFilter === 'all' || p.team_name === teamFilter;
    return matchSearch && matchTeam;
  });

  const grouped = {
    red:    filtered.filter(p => p.risk === 'red'),
    yellow: filtered.filter(p => p.risk === 'yellow'),
    green:  filtered.filter(p => p.risk === 'green'),
  };

  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ward Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {patients.length} active patient{patients.length !== 1 ? 's' : ''} · Updated {now}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Summary badges */}
          <span className="badge-red">{patients.filter(p=>p.risk==='red').length} Critical</span>
          <span className="badge-yellow">{patients.filter(p=>p.risk==='yellow').length} Watch</span>
          <span className="badge-green">{patients.filter(p=>p.risk==='green').length} Stable</span>
          <button
            onClick={refetch}
            disabled={isFetching}
            className="ml-2 p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <svg className={`w-4 h-4 text-slate-500 ${isFetching ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          placeholder="Search name or bed..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field max-w-xs"
        />
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="select-field max-w-[150px]">
          {teams.map(t => <option key={t} value={t}>{t === 'all' ? 'All Teams' : t}</option>)}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">
          Failed to load patients. <button onClick={refetch} className="underline">Retry</button>
        </div>
      ) : (
        <>
          <RiskSection level="red" patients={grouped.red} onPatientClick={id => navigate(`/patients/${id}`)} />
          <RiskSection level="yellow" patients={grouped.yellow} onPatientClick={id => navigate(`/patients/${id}`)} />
          <RiskSection level="green" patients={grouped.green} onPatientClick={id => navigate(`/patients/${id}`)} />
        </>
      )}
    </div>
  );
}
