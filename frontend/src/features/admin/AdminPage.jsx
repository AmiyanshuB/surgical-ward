import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { formatDate, Spinner } from '../../components/ui';

const INITIAL_PATIENT = {
  full_name: '', age: '', gender: 'male', bed_number: '', diagnosis: '',
  surgery_name: '', consultant_name: '', team_name: '', admission_date: '', surgery_date: '', ward_name: 'Surgical Ward A'
};

const INITIAL_USER = { full_name: '', email: '', role: 'doctor', password: '' };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function AddPatientModal({ onClose, onSaved }) {
  const [form, setForm] = useState(INITIAL_PATIENT);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => api.post('/admin/patients', data),
    onSuccess: () => onSaved(),
  });

  return (
    <Modal title="Admit New Patient" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="form-label">Full Name *</label>
            <input value={form.full_name} onChange={set('full_name')} className="input-field" placeholder="Patient name" required />
          </div>
          <div>
            <label className="form-label">Age *</label>
            <input type="number" value={form.age} onChange={set('age')} className="input-field" placeholder="45" />
          </div>
          <div>
            <label className="form-label">Gender *</label>
            <select value={form.gender} onChange={set('gender')} className="select-field">
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="form-label">Bed Number *</label>
            <input value={form.bed_number} onChange={set('bed_number')} className="input-field" placeholder="B-11" />
          </div>
          <div>
            <label className="form-label">Team</label>
            <input value={form.team_name} onChange={set('team_name')} className="input-field" placeholder="Team A" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Surgery Name</label>
            <input value={form.surgery_name} onChange={set('surgery_name')} className="input-field" placeholder="Appendectomy" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Diagnosis</label>
            <input value={form.diagnosis} onChange={set('diagnosis')} className="input-field" placeholder="Post-operative surgical care" />
          </div>
          <div>
            <label className="form-label">Consultant</label>
            <input value={form.consultant_name} onChange={set('consultant_name')} className="input-field" placeholder="Dr. Name" />
          </div>
          <div>
            <label className="form-label">Ward</label>
            <input value={form.ward_name} onChange={set('ward_name')} className="input-field" />
          </div>
          <div>
            <label className="form-label">Admission Date</label>
            <input type="date" value={form.admission_date} onChange={set('admission_date')} className="input-field" />
          </div>
          <div>
            <label className="form-label">Surgery Date</label>
            <input type="date" value={form.surgery_date} onChange={set('surgery_date')} className="input-field" />
          </div>
        </div>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error.response?.data?.error || 'Error'}</div>}
        <div className="flex justify-end gap-3 pt-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => mutate(form)} disabled={isPending} className="btn-primary">
            {isPending ? 'Admitting...' : 'Admit Patient'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddUserModal({ onClose, onSaved }) {
  const [form, setForm] = useState(INITIAL_USER);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => api.post('/admin/users', data),
    onSuccess: () => onSaved(),
  });
  return (
    <Modal title="Add User" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="form-label">Full Name *</label>
          <input value={form.full_name} onChange={set('full_name')} className="input-field" />
        </div>
        <div>
          <label className="form-label">Email *</label>
          <input type="email" value={form.email} onChange={set('email')} className="input-field" />
        </div>
        <div>
          <label className="form-label">Role *</label>
          <select value={form.role} onChange={set('role')} className="select-field">
            <option value="doctor">Doctor</option>
            <option value="consultant">Consultant</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="form-label">Password *</label>
          <input type="password" value={form.password} onChange={set('password')} className="input-field" />
        </div>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error.response?.data?.error || 'Error'}</div>}
        <div className="flex justify-end gap-3 pt-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => mutate(form)} disabled={isPending} className="btn-primary">
            {isPending ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('patients');
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  const { data: allPatients = [], isLoading: loadingPatients } = useQuery({
    queryKey: ['admin', 'patients'],
    queryFn: () => api.get('/admin/patients').then(r => r.data),
    enabled: user?.role === 'admin' || user?.role === 'consultant',
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
    enabled: user?.role === 'admin',
  });

  const { mutate: updatePatient } = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/admin/patients/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['admin', 'patients']),
  });

  const { mutate: toggleUser } = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/admin/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries(['admin', 'users']),
  });

  const riskColors = { red: 'text-red-600 bg-red-50', yellow: 'text-amber-600 bg-amber-50', green: 'text-emerald-600 bg-emerald-50' };
  const statusColors = { active: 'text-emerald-700 bg-emerald-50', discharged: 'text-slate-500 bg-slate-100', archived: 'text-slate-400 bg-slate-50' };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin Panel</h1>
          <p className="text-slate-500 text-sm mt-0.5">Patient and user management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddPatient(true)} className="btn-primary text-sm">+ Admit Patient</button>
          {user?.role === 'admin' && (
            <button onClick={() => setShowAddUser(true)} className="btn-secondary text-sm">+ Add User</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {['patients', ...(user?.role === 'admin' ? ['users'] : [])].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-slate-900 border-b-2 border-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'patients' && (
        <div className="section-card overflow-hidden">
          {loadingPatients ? <div className="flex justify-center py-10"><Spinner /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Bed', 'Patient', 'Surgery', 'POD', 'Team', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allPatients.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">{p.bed_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.full_name}</div>
                        <div className="text-xs text-slate-400">{p.age}y · {p.gender} · {p.patient_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{p.surgery_name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{p.pod ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{p.team_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[p.status]}`}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'active' && (
                          <button
                            onClick={() => { if (window.confirm(`Discharge ${p.full_name}?`)) updatePatient({ id: p.id, data: { status: 'discharged' } }); }}
                            className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
                          >
                            Discharge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && user?.role === 'admin' && (
        <div className="section-card overflow-hidden">
          {loadingUsers ? <div className="flex justify-center py-10"><Spinner /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{u.role}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleUser({ id: u.id, is_active: !u.is_active })}
                          className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddPatient && (
        <AddPatientModal onClose={() => setShowAddPatient(false)} onSaved={() => { setShowAddPatient(false); qc.invalidateQueries(['admin', 'patients']); qc.invalidateQueries(['patients', 'active']); }} />
      )}
      {showAddUser && (
        <AddUserModal onClose={() => setShowAddUser(false)} onSaved={() => { setShowAddUser(false); qc.invalidateQueries(['admin', 'users']); }} />
      )}
    </div>
  );
}
