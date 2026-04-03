import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'date',         label: 'Date',      type: 'date',   required: true },
  { key: 'time',         label: 'Time',      type: 'time',   required: false },
  { key: 'hr',           label: 'HR',        type: 'int',    unit: 'bpm',    normal: [60,100] },
  { key: 'systolic_bp',  label: 'SBP',       type: 'int',    unit: 'mmHg',   normal: [90,140] },
  { key: 'diastolic_bp', label: 'DBP',       type: 'int',    unit: 'mmHg',   normal: [60,90]  },
  { key: 'rr',           label: 'RR',        type: 'int',    unit: '/min',   normal: [12,20]  },
  { key: 'spo2',         label: 'SpO2',      type: 'float',  unit: '%',      normal: [94,100] },
  { key: 'temp_c',       label: 'Temp',      type: 'float',  unit: '°C',     normal: [36,37.5]},
  { key: 'uop_ml',       label: 'UOP',       type: 'int',    unit: 'ml',     normal: null },
  { key: 'glucose',      label: 'Glucose',   type: 'float',  unit: 'mmol/L', normal: [4,7.8]  },
  { key: 'lactate',      label: 'Lactate',   type: 'float',  unit: 'mmol/L', normal: [0.5,2]  },
];

function isAbnormal(col, val) {
  if (!col.normal || val == null || val === '') return false;
  const v = parseFloat(val);
  return isNaN(v) ? false : v < col.normal[0] || v > col.normal[1];
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function Steps({ current }) {
  const steps = ['Upload Photo', 'Extracting', 'Review & Edit', 'Done'];
  return (
    <div className="flex items-center gap-1 mb-5">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            i < current ? 'text-emerald-600' :
            i === current ? 'text-slate-800' : 'text-slate-400'
          }`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              i < current ? 'bg-emerald-500 text-white' :
              i === current ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-px ${i < current ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function VitalsOCRModal({ patientId, patientName, onClose, onSaved }) {
  const [step, setStep] = useState(0); // 0=upload 1=extracting 2=review 3=done
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [ocrError, setOcrError] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  const fileInputRef = useRef();
  const qc = useQueryClient();

  // ── Image selection ────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
    setOcrError('');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  }, [handleFile]);

  // ── OCR extraction ─────────────────────────────────────────────────────────
  const { mutate: runOCR, isPending: extracting } = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('image', imageFile);
      const res = await api.post('/ocr/vitals', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.rows.length === 0) {
        setOcrError('No vitals found in this image. Make sure the image is clear and contains a vitals table or chart.');
        setStep(0);
        return;
      }
      setRows(data.rows.map((r, i) => ({ ...r, _id: i })));
      setStep(2);
    },
    onError: (err) => {
      setOcrError(err.response?.data?.error || 'Extraction failed. Please try again.');
      setStep(0);
    },
  });

  const handleExtract = () => {
    if (!imageFile) return;
    setOcrError('');
    setStep(1);
    runOCR();
  };

  // ── Row editing ────────────────────────────────────────────────────────────
  const updateCell = (rowId, key, value) => {
    setRows(prev => prev.map(r => r._id === rowId ? { ...r, [key]: value } : r));
  };

  const deleteRow = (rowId) => {
    setRows(prev => prev.filter(r => r._id !== rowId));
  };

  const addRow = () => {
    const newId = Math.max(...rows.map(r => r._id), -1) + 1;
    setRows(prev => [...prev, {
      _id: newId, date: new Date().toISOString().split('T')[0], time: '08:00',
      hr: '', systolic_bp: '', diastolic_bp: '', rr: '', spo2: '',
      temp_c: '', uop_ml: '', glucose: '', lactate: '',
    }]);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const { mutate: saveRows, isPending: saving } = useMutation({
    mutationFn: () => api.post('/ocr/vitals/save', { patient_id: patientId, rows }),
    onSuccess: (res) => {
      setSaveResult(res.data);
      setStep(3);
      qc.invalidateQueries(['vitals-history', String(patientId)]);
      qc.invalidateQueries(['patient', String(patientId)]);
      qc.invalidateQueries(['patients', 'active']);
      onSaved?.();
    },
    onError: (err) => {
      setOcrError(err.response?.data?.error || 'Save failed');
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <span className="text-xl">📷</span>
              Import Vitals from Register Photo
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{patientName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Steps current={step} />

          {/* ── Step 0: Upload ─────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-2xl p-8 text-center cursor-pointer transition-colors group"
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Register" className="max-h-64 mx-auto rounded-xl object-contain border border-slate-200 shadow" />
                    <p className="text-sm text-slate-600 font-medium">{imageFile?.name}</p>
                    <p className="text-xs text-slate-400">Click to change image</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-emerald-50 transition-colors">
                      <span className="text-3xl">📋</span>
                    </div>
                    <div>
                      <p className="text-slate-700 font-semibold">Drop photo here or click to browse</p>
                      <p className="text-slate-400 text-sm mt-1">JPG, PNG, HEIC up to 10MB</p>
                    </div>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Take a clear photo of the paper vitals register — the AI will extract all dates and readings automatically
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>

              {/* Tips */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">📸 Tips for best results</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Lay the register flat and photograph straight on — avoid angles</li>
                  <li>• Ensure good lighting — no shadows over the table</li>
                  <li>• Include column headers (Date, HR, BP etc.) in the photo</li>
                  <li>• You can photograph multiple rows at once</li>
                  <li>• You'll be able to review and correct all values before saving</li>
                </ul>
              </div>

              {ocrError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{ocrError}</div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleExtract}
                  disabled={!imageFile}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                >
                  <span>Extract Vitals</span>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: Extracting ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <span className="text-4xl animate-pulse">🔍</span>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                  <svg className="animate-spin w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75"/>
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-800 font-semibold text-lg">Analysing your register photo...</p>
                <p className="text-slate-500 text-sm mt-1">Claude Vision is reading dates, vitals, and values</p>
                <p className="text-slate-400 text-xs mt-3">This takes 10–20 seconds</p>
              </div>
              {imagePreview && (
                <img src={imagePreview} alt="Processing" className="max-h-32 rounded-xl object-contain border border-slate-200 opacity-60" />
              )}
            </div>
          )}

          {/* ── Step 2: Review & Edit ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-800 font-semibold">
                    ✅ Extracted {rows.length} reading{rows.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">Review and correct any values before saving. Abnormal values are highlighted.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setStep(0); setRows([]); }} className="btn-secondary text-xs py-1.5">
                    Re-scan
                  </button>
                  <button onClick={addRow} className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                    + Add Row
                  </button>
                </div>
              </div>

              {/* Editable table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {COLUMNS.map(col => (
                        <th key={col.key} className="px-2 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {col.label}
                          {col.unit && <span className="text-slate-400 font-normal ml-0.5">({col.unit})</span>}
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-left font-semibold text-slate-500">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row._id} className="hover:bg-slate-50">
                        {COLUMNS.map(col => {
                          const abnormal = isAbnormal(col, row[col.key]);
                          return (
                            <td key={col.key} className="px-1 py-1">
                              <input
                                type={col.type === 'date' ? 'date' : col.type === 'time' ? 'time' : 'number'}
                                step={col.type === 'float' ? '0.1' : '1'}
                                value={row[col.key] ?? ''}
                                onChange={e => updateCell(row._id, col.key, e.target.value)}
                                className={`w-full rounded-lg border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 transition-all ${
                                  abnormal
                                    ? 'border-amber-300 bg-amber-50 text-amber-800 focus:border-amber-400 focus:ring-amber-200'
                                    : row[col.key] != null && row[col.key] !== ''
                                    ? 'border-emerald-200 bg-emerald-50/40 text-slate-800 focus:border-slate-400 focus:ring-slate-200'
                                    : 'border-slate-200 bg-white text-slate-400 focus:border-slate-400 focus:ring-slate-200'
                                }`}
                                placeholder="—"
                              />
                            </td>
                          );
                        })}
                        <td className="px-1 py-1">
                          <button
                            onClick={() => deleteRow(row._id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Abnormal value
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> Value present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-white border border-slate-200" /> Empty / not recorded
                </span>
              </div>

              {ocrError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{ocrError}</div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(0)} className="btn-secondary">← Back</button>
                <button
                  onClick={() => saveRows()}
                  disabled={saving || rows.length === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75"/>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>Save {rows.length} Reading{rows.length !== 1 ? 's' : ''} →</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ───────────────────────────────────────────── */}
          {step === 3 && saveResult && (
            <div className="flex flex-col items-center justify-center py-12 space-y-5 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <span className="text-4xl">✅</span>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">
                  {saveResult.saved} Reading{saveResult.saved !== 1 ? 's' : ''} Saved
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  Historical vitals imported successfully for {patientName}
                </p>
              </div>
              {saveResult.errors?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 max-w-sm">
                  {saveResult.errors.length} row{saveResult.errors.length > 1 ? 's' : ''} could not be saved — check the values and try again.
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setStep(0); setRows([]); setImageFile(null); setImagePreview(null); setSaveResult(null); }}
                  className="btn-secondary">
                  Import Another Photo
                </button>
                <button onClick={onClose} className="btn-primary">Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}