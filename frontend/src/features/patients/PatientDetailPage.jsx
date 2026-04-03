import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { RiskBadge, VitalBox, FlagBadge, DeviceIcon, Spinner, formatDateTime, formatDate } from '../../components/ui';
import AddNoteModal from '../notes/AddNoteModal';
import VitalsPanel from './VitalsPanel';

function isVitalAbnormal(key, val) {
  if (val == null) return { abnormal: false, critical: false };
  const red = { hr: [125, null], spo2: [null, 90], systolic_bp: [null, 90], rr: [25, null], temp_c: [38.5, null] };
  const yellow = { hr: [100, 50], spo2: [null, 94], systolic_bp: [null, 100], rr: [20, null], temp_c: [38.0, null] };
  const rk = red[key];
  const yk = yellow[key];
  const critical = rk && ((rk[0] && val > rk[0]) || (rk[1] && val < rk[1]));
  const abnormal = yk && ((yk[0] && val > yk[0]) || (yk[1] && val < yk[1]));
  return { critical, abnormal: abnormal && !critical };
}

function SectionCard({ title, children, action }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <h3 className="section-title">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TimelinePanel({ patientId }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['timeline', patientId],
    queryFn: () => api.get(`/patients/${patientId}/timeline`).then(r => r.data),
  });

  const iconMap = {
    admission: { bg: 'bg-blue-100', text: 'text-blue-600', icon: '⊕' },
    surgery: { bg: 'bg-purple-100', text: 'text-purple-600', icon: '✦' },
    round_note: { bg: 'bg-slate-100', text: 'text-slate-600', icon: '◈' },
    discharge: { bg: 'bg-emerald-100', text: 'text-emerald-600', icon: '✓' },
    vital_update: { bg: 'bg-amber-100', text: 'text-amber-600', icon: '◉' },
  };

  if (isLoading) return <div className="flex justify-center py-6"><Spinner /></div>;

  return (
    <div className="space-y-0">
      {events.length === 0 ? (
        <p className="text-slate-400 text-sm py-4 text-center">No timeline events</p>
      ) : (
        events.map((ev, idx) => {
          const ic = iconMap[ev.event_type] || iconMap.round_note;
          return (
            <div key={ev.id} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full ${ic.bg} ${ic.text} flex items-center justify-center text-sm flex-shrink-0 mt-0.5`}>
                  {ic.icon}
                </div>
                {idx < events.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-1" />}
              </div>
              <div className="pb-4 min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-700 font-medium leading-snug">{ev.summary}</p>
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap flex-shrink-0">
                    {formatDateTime(ev.event_time)}
                  </span>
                </div>
                {ev.actor_name && (
                  <p className="text-xs text-slate-400 mt-0.5">{ev.actor_name}</p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNoteModal, setShowNoteModal] = useState(false);

  const { data: patient, isLoading, error, refetch } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`).then(r => r.data),
  });

  const handleNoteSaved = () => {
    setShowNoteModal(false);
    queryClient.invalidateQueries(['patient', id]);
    queryClient.invalidateQueries(['timeline', id]);
    queryClient.invalidateQueries(['patients', 'active']);
    refetch();
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Spinner size="lg" />
    </div>
  );

  if (error || !patient) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm">
        Failed to load patient. <button onClick={() => navigate(-1)} className="underline">Go back</button>
      </div>
    </div>
  );

  const v = patient.vitals || {};

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Back */}
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-5 transition-colors">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to Dashboard
      </button>

      {/* Patient Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${
              patient.risk === 'red' ? 'bg-red-100 text-red-700' :
              patient.risk === 'yellow' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {patient.full_name?.[0]}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-slate-900">{patient.full_name}</h1>
                <RiskBadge level={patient.risk} size="lg" />
              </div>
              <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-slate-600">
                <span>{patient.age} years · {patient.gender}</span>
                <span>·</span>
                <span className="font-mono font-semibold text-slate-700">{patient.bed_number}</span>
                <span>·</span>
                <span>POD <strong>{patient.pod ?? '—'}</strong></span>
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {patient.surgery_name} · {patient.team_name} · {patient.consultant_name}
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setShowNoteModal(true)} className="btn-primary flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Add Note
            </button>
            <button onClick={refetch} className="btn-secondary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Context row */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Admission</div>
            <div className="text-slate-700">{formatDate(patient.admission_date)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Surgery Date</div>
            <div className="text-slate-700">{formatDate(patient.surgery_date)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Ward</div>
            <div className="text-slate-700">{patient.ward_name || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Diagnosis</div>
            <div className="text-slate-700 truncate">{patient.diagnosis || '—'}</div>
          </div>
        </div>

        {/* Risk reasons */}
        {patient.risk_reasons?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              {patient.risk_reasons.map((r, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{r}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vitals Panel — radar chart + history */}
          <VitalsPanel patientId={id} patientName={patient.full_name} latestVitals={v && Object.keys(v).length ? v : null} />

          {/* I/O + Red Flags row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* I/O */}
            <SectionCard title="Intake / Output">
              {patient.recent_notes?.[0] ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Intake</span>
                    <span className="font-mono font-semibold text-slate-800">{patient.recent_notes[0].intake_ml ?? '—'} ml</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Output</span>
                    <span className="font-mono font-semibold text-slate-800">{patient.recent_notes[0].output_ml ?? '—'} ml</span>
                  </div>
                  {patient.recent_notes[0].intake_ml != null && patient.recent_notes[0].output_ml != null && (
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <span className="text-sm font-medium text-slate-700">Balance</span>
                      <span className={`font-mono font-bold ${
                        patient.recent_notes[0].intake_ml - patient.recent_notes[0].output_ml >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {patient.recent_notes[0].intake_ml - patient.recent_notes[0].output_ml > 0 ? '+' : ''}
                        {patient.recent_notes[0].intake_ml - patient.recent_notes[0].output_ml} ml
                      </span>
                    </div>
                  )}
                  {patient.recent_notes[0].io_comment && (
                    <p className="text-xs text-slate-500 italic mt-2">{patient.recent_notes[0].io_comment}</p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No I/O recorded</p>
              )}
            </SectionCard>

            {/* Red Flags */}
            <SectionCard title="Red Flags">
              {patient.active_flags?.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  No active flags
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {patient.active_flags?.map(f => (
                    <FlagBadge key={f.id || f.flag_type} type={f.flag_type} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Devices */}
          <SectionCard title="Active Devices">
            {patient.devices?.length === 0 ? (
              <p className="text-slate-400 text-sm">No active devices</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {patient.devices?.map(d => (
                  <DeviceIcon key={d.id} type={d.device_type || d} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Recent Notes */}
          <SectionCard
            title="Recent Notes"
            action={
              <button onClick={() => setShowNoteModal(true)} className="btn-primary text-xs py-1.5">
                + Add Note
              </button>
            }
          >
            {patient.recent_notes?.length === 0 ? (
              <p className="text-slate-400 text-sm">No notes yet</p>
            ) : (
              <div className="space-y-4">
                {patient.recent_notes?.map((note, i) => (
                  <div key={note.id} className={`${i > 0 ? 'pt-4 border-t border-slate-100' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-600">{note.author_name}</span>
                      <span className="text-xs text-slate-400 font-mono">{formatDateTime(note.created_at)}</span>
                    </div>
                    {note.status_summary && (
                      <p className="text-sm text-slate-700 mb-1.5">{note.status_summary}</p>
                    )}
                    {note.plan_24h && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">24h Plan: </span>
                        <span className="text-xs text-blue-800">{note.plan_24h}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column - Timeline */}
        <div className="space-y-5">
          <SectionCard title="Timeline">
            <TimelinePanel patientId={id} />
          </SectionCard>

          {/* Labs placeholder */}
          <SectionCard title="Labs / Imaging">
            {patient.recent_notes?.[0]?.labs_imaging_update ? (
              <p className="text-sm text-slate-700">{patient.recent_notes[0].labs_imaging_update}</p>
            ) : (
              <p className="text-slate-400 text-sm">No lab updates in recent notes</p>
            )}
          </SectionCard>

          {/* Medications */}
          <SectionCard title="Medications">
            {patient.recent_notes?.[0]?.medication_notes ? (
              <p className="text-sm text-slate-700">{patient.recent_notes[0].medication_notes}</p>
            ) : (
              <p className="text-slate-400 text-sm">No medication notes</p>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Note Modal */}
      {showNoteModal && (
        <AddNoteModal
          patientId={id}
          patient={patient}
          onSaved={handleNoteSaved}
          onClose={() => setShowNoteModal(false)}
        />
      )}
    </div>
  );
}