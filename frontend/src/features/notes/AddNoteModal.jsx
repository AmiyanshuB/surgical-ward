import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { FlagBadge } from '../../components/ui';

const FLAG_TYPES = [
  { value: 'hypotension', label: 'Hypotension', critical: true },
  { value: 'tachycardia', label: 'Tachycardia', critical: true },
  { value: 'sepsis_concern', label: 'Sepsis Concern', critical: true },
  { value: 'respiratory_distress', label: 'Respiratory Distress', critical: true },
  { value: 'bleeding', label: 'Bleeding', critical: true },
  { value: 'neurological_change', label: 'Neurological Change', critical: true },
  { value: 'low_urine_output', label: 'Low Urine Output', critical: false },
  { value: 'device_issue', label: 'Device Issue', critical: false },
  { value: 'infection_concern', label: 'Infection Concern', critical: false },
  { value: 'other', label: 'Other', critical: false },
];

const INITIAL = {
  status_summary: '',
  hr: '', systolic_bp: '', diastolic_bp: '', rr: '', spo2: '', temp_c: '', uop_ml: '', glucose: '', lactate: '',
  intake_ml: '', output_ml: '', io_comment: '',
  exam_text: '',
  device_summary: '',
  labs_imaging_update: '',
  medication_notes: '',
  nutrition_notes: '',
  plan_24h: '',
  risk_override: '',
  new_flags: [],
  resolve_flags: [],
};

function FormSection({ title, children, color = 'slate' }) {
  const colors = { slate: 'bg-slate-50 border-slate-200', blue: 'bg-blue-50 border-blue-100', amber: 'bg-amber-50 border-amber-100' };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text', placeholder, unit }) {
  return (
    <div>
      <label className="form-label">{label}{unit && <span className="text-slate-400 normal-case font-normal ml-1">({unit})</span>}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="input-field font-mono" />
    </div>
  );
}

export default function AddNoteModal({ patientId, patient, onSaved, onClose }) {
  const [form, setForm] = useState(INITIAL);
  const [tab, setTab] = useState('status');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  const setNum = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const toggleFlag = (type, listKey) => {
    setForm(f => ({
      ...f,
      [listKey]: f[listKey].includes(type) ? f[listKey].filter(x => x !== type) : [...f[listKey], type],
    }));
  };

  const { mutate: saveNote, isPending, error } = useMutation({
    mutationFn: (data) => api.post(`/patients/${patientId}/notes`, data),
    onSuccess: () => onSaved(),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.status_summary.trim() && !form.plan_24h.trim()) {
      alert('Please enter at least a status summary or 24h plan.');
      return;
    }
    const payload = { ...form };
    // Convert numeric strings
    ['hr', 'systolic_bp', 'diastolic_bp', 'rr', 'intake_ml', 'output_ml', 'uop_ml'].forEach(k => {
      payload[k] = payload[k] !== '' ? parseInt(payload[k]) || null : null;
    });
    ['spo2', 'temp_c', 'glucose', 'lactate'].forEach(k => {
      payload[k] = payload[k] !== '' ? parseFloat(payload[k]) || null : null;
    });
    if (!payload.risk_override) payload.risk_override = null;
    saveNote(payload);
  };

  const TABS = [
    { id: 'status', label: 'Status' },
    { id: 'vitals', label: 'Vitals & I/O' },
    { id: 'clinical', label: 'Clinical' },
    { id: 'flags', label: 'Flags' },
    { id: 'plan', label: 'Plan' },
  ];

  const activeFlags = patient.active_flags?.map(f => f.flag_type || f) || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add Round Note</h2>
            <p className="text-sm text-slate-500">{patient.full_name} · {patient.bed_number} · POD {patient.pod ?? '?'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 gap-1 pt-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t.id ? 'text-slate-900 border-b-2 border-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Status tab */}
          {tab === 'status' && (
            <>
              <FormSection title="Status Summary">
                <div>
                  <label className="form-label">Overall Status <span className="text-red-500">*</span></label>
                  <textarea
                    value={form.status_summary}
                    onChange={set('status_summary')}
                    rows={3}
                    placeholder="Patient reviewed on morning round. Condition..."
                    className="textarea-field"
                  />
                </div>
              </FormSection>

              <FormSection title="Examination">
                <div>
                  <label className="form-label">Examination Findings</label>
                  <textarea
                    value={form.exam_text}
                    onChange={set('exam_text')}
                    rows={3}
                    placeholder="Abdomen soft, non-tender. Wound healing well..."
                    className="textarea-field"
                  />
                </div>
              </FormSection>

              <FormSection title="Device Summary">
                <div>
                  <label className="form-label">Devices & Drains</label>
                  <input type="text" value={form.device_summary} onChange={set('device_summary')}
                    placeholder="Foley in situ, drain draining serous fluid..." className="input-field" />
                </div>
              </FormSection>
            </>
          )}

          {/* Vitals & I/O tab */}
          {tab === 'vitals' && (
            <>
              <FormSection title="Vitals (leave blank if unchanged)">
                <div className="grid grid-cols-3 gap-3">
                  <TextInput label="HR" value={form.hr} onChange={setNum('hr')} type="number" placeholder="72" unit="bpm" />
                  <TextInput label="SBP" value={form.systolic_bp} onChange={setNum('systolic_bp')} type="number" placeholder="120" unit="mmHg" />
                  <TextInput label="DBP" value={form.diastolic_bp} onChange={setNum('diastolic_bp')} type="number" placeholder="80" unit="mmHg" />
                  <TextInput label="SpO2" value={form.spo2} onChange={setNum('spo2')} type="number" placeholder="98" unit="%" />
                  <TextInput label="RR" value={form.rr} onChange={setNum('rr')} type="number" placeholder="16" unit="/min" />
                  <TextInput label="Temp" value={form.temp_c} onChange={setNum('temp_c')} type="number" placeholder="37.2" unit="°C" />
                  <TextInput label="UOP" value={form.uop_ml} onChange={setNum('uop_ml')} type="number" placeholder="400" unit="ml" />
                  <TextInput label="Glucose" value={form.glucose} onChange={setNum('glucose')} type="number" placeholder="5.4" unit="mmol/L" />
                  <TextInput label="Lactate" value={form.lactate} onChange={setNum('lactate')} type="number" placeholder="1.2" unit="mmol/L" />
                </div>
              </FormSection>

              <FormSection title="Intake / Output">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <TextInput label="Intake" value={form.intake_ml} onChange={setNum('intake_ml')} type="number" placeholder="1500" unit="ml" />
                  <TextInput label="Output" value={form.output_ml} onChange={setNum('output_ml')} type="number" placeholder="800" unit="ml" />
                </div>
                <div>
                  <label className="form-label">I/O Comment</label>
                  <input type="text" value={form.io_comment} onChange={set('io_comment')}
                    placeholder="Adequate urine output. IV fluids ongoing..." className="input-field" />
                </div>
              </FormSection>
            </>
          )}

          {/* Clinical tab */}
          {tab === 'clinical' && (
            <>
              <FormSection title="Labs / Imaging">
                <label className="form-label">Latest Findings</label>
                <textarea value={form.labs_imaging_update} onChange={set('labs_imaging_update')} rows={3}
                  placeholder="WBC 12.4, CRP 45. CXR clear. Wound swab sent..." className="textarea-field" />
              </FormSection>

              <FormSection title="Medications">
                <label className="form-label">Medication Notes</label>
                <textarea value={form.medication_notes} onChange={set('medication_notes')} rows={2}
                  placeholder="Continue IV antibiotics. Analgesia stepped down..." className="textarea-field" />
              </FormSection>

              <FormSection title="Nutrition">
                <label className="form-label">Nutrition Notes</label>
                <input type="text" value={form.nutrition_notes} onChange={set('nutrition_notes')}
                  placeholder="Diet tolerating well. Oral intake encouraged..." className="input-field" />
              </FormSection>
            </>
          )}

          {/* Flags tab */}
          {tab === 'flags' && (
            <>
              {activeFlags.length > 0 && (
                <FormSection title="Active Flags — Mark as Resolved" color="amber">
                  <div className="flex flex-wrap gap-2">
                    {activeFlags.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleFlag(type, 'resolve_flags')}
                        className={`transition-all rounded-lg px-3 py-1.5 text-xs font-medium border ${
                          form.resolve_flags.includes(type)
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-700 line-through'
                            : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {form.resolve_flags.includes(type) ? '✓ ' : ''}{type.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </FormSection>
              )}

              <FormSection title="Add New Flags">
                <div className="flex flex-wrap gap-2">
                  {FLAG_TYPES.filter(f => !activeFlags.includes(f.value)).map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => toggleFlag(f.value, 'new_flags')}
                      className={`transition-all rounded-lg px-3 py-1.5 text-xs font-medium border ${
                        form.new_flags.includes(f.value)
                          ? f.critical ? 'bg-red-100 border-red-300 text-red-700' : 'bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {form.new_flags.includes(f.value) ? '✓ ' : '+ '}{f.label}
                    </button>
                  ))}
                </div>
              </FormSection>

              <FormSection title="Risk Override">
                <label className="form-label">Manual Risk Override</label>
                <select value={form.risk_override} onChange={set('risk_override')} className="select-field">
                  <option value="">Auto (system calculated)</option>
                  <option value="red">🔴 Critical</option>
                  <option value="yellow">🟡 Watch Closely</option>
                  <option value="green">🟢 Stable</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Override only if system risk doesn't reflect clinical picture.</p>
              </FormSection>
            </>
          )}

          {/* Plan tab */}
          {tab === 'plan' && (
            <FormSection title="Plan for Next 24 Hours" color="blue">
              <label className="form-label">24h Plan <span className="text-red-500">*</span></label>
              <textarea
                value={form.plan_24h}
                onChange={set('plan_24h')}
                rows={5}
                placeholder="Continue current management. Monitor vitals q4h. Reassess wound tomorrow. If fever persists, review antibiotics..."
                className="textarea-field"
              />
            </FormSection>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              Failed to save note: {error.response?.data?.error || 'Server error'}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <div className="flex gap-2">
            {TABS.map((t, i) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`w-2 h-2 rounded-full transition-colors ${tab === t.id ? 'bg-slate-800' : 'bg-slate-300'}`} />
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={isPending} className="btn-primary flex items-center gap-2">
              {isPending ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75"/></svg> Saving...</>
              ) : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
