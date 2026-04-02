import React from 'react';

export function RiskBadge({ level, size = 'md' }) {
  const map = {
    red:    { label: 'CRITICAL', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
    yellow: { label: 'WATCH',    cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    green:  { label: 'STABLE',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  };
  const { label, cls, dot } = map[level] || map.green;
  const px = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${cls} ${px}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function VitalBox({ label, value, unit, abnormal, critical }) {
  const textColor = critical ? 'text-red-600' : abnormal ? 'text-amber-600' : 'text-slate-800';
  const bg = critical ? 'bg-red-50 border-red-200' : abnormal ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200';
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className={`font-mono text-lg font-semibold leading-tight ${textColor}`}>
        {value ?? <span className="text-slate-300 text-base">—</span>}
        {value != null && unit && <span className="text-xs font-normal ml-0.5 opacity-70">{unit}</span>}
      </div>
      <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export function FlagBadge({ type }) {
  const labels = {
    hypotension: 'Hypotension',
    tachycardia: 'Tachycardia',
    sepsis_concern: 'Sepsis?',
    respiratory_distress: 'Resp Distress',
    bleeding: 'Bleeding',
    low_urine_output: 'Low UOP',
    neurological_change: 'Neuro Δ',
    device_issue: 'Device Issue',
    infection_concern: 'Infection?',
    other: 'Other',
  };
  const critical = ['hypotension', 'sepsis_concern', 'respiratory_distress', 'bleeding', 'neurological_change'];
  const isCritical = critical.includes(type);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border ${
      isCritical ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'
    }`}>
      {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {labels[type] || type}
    </span>
  );
}

export function DeviceIcon({ type }) {
  const map = {
    foley_catheter: { label: 'Foley', icon: '⊗' },
    iv_line:        { label: 'IV Line', icon: '⊕' },
    central_line:   { label: 'Central Line', icon: '⊞' },
    drain:          { label: 'Drain', icon: '⊘' },
    ng_tube:        { label: 'NG Tube', icon: '⊖' },
    other:          { label: 'Device', icon: '⊡' },
  };
  const { label, icon } = map[type] || map.other;
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md px-2 py-1 text-xs font-medium">
      <span className="text-slate-400">{icon}</span>
      {label}
    </span>
  );
}

export function Spinner({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  return (
    <svg className={`animate-spin text-slate-400 ${sz}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="text-center py-12 text-slate-400">
      <div className="text-3xl mb-2">○</div>
      <div className="text-sm">{message}</div>
    </div>
  );
}

export function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
