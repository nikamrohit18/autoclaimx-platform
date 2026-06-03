'use client';

import { useEffect, useState } from 'react';
import { workshopsApi } from '@/lib/api';
import type { Workshop } from '@autoclaimx/shared-types';

// ── constants ─────────────────────────────────────────────────────────────────

const ACCREDITATION_STATUSES = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const;
type AccreditationStatus = typeof ACCREDITATION_STATUSES[number];

const STATUS_COLORS: Record<AccreditationStatus, string> = {
  APPROVED:  'bg-green-100 text-green-700',
  PENDING:   'bg-yellow-100 text-yellow-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  REJECTED:  'bg-gray-100 text-gray-500',
};

const BLANK_FORM = { name: '', email: '', phone: '', address: '', registrationNumber: '' };

// ── edit modal ────────────────────────────────────────────────────────────────

function EditModal({ workshop, onClose, onSaved }: { workshop: Workshop; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name:                workshop.name,
    email:               workshop.email ?? '',
    phone:               workshop.phone ?? '',
    address:             workshop.address ?? '',
    registrationNumber:  workshop.registrationNumber ?? '',
    accreditationStatus: workshop.accreditationStatus as AccreditationStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await workshopsApi.update(workshop.id, {
        name:               form.name,
        email:              form.email || undefined,
        phone:              form.phone || undefined,
        address:            form.address || undefined,
        registrationNumber: form.registrationNumber || undefined,
        accreditationStatus: form.accreditationStatus,
      });
      onSaved(); onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Edit Workshop</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Registration No.</label>
              <input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="REG-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Accreditation Status</label>
              <select value={form.accreditationStatus} onChange={(e) => setForm({ ...form, accreditationStatus: e.target.value as AccreditationStatus })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ACCREDITATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="workshop@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+60123456789" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="123 Workshop St, City" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border text-sm rounded-md text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWs, setEditingWs]   = useState<Workshop | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [form, setForm]             = useState(BLANK_FORM);
  const [search, setSearch]         = useState('');

  const load = () =>
    workshopsApi.list().then((data) => setWorkshops(data as Workshop[])).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await workshopsApi.create({
        name:               form.name,
        email:              form.email || undefined,
        phone:              form.phone || undefined,
        address:            form.address || undefined,
        registrationNumber: form.registrationNumber || undefined,
      });
      setForm(BLANK_FORM); setShowCreate(false);
      await load();
    } catch {
      setError('Failed to create workshop. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(w: Workshop) {
    await workshopsApi.update(w.id, { active: !w.active });
    await load();
  }

  const q = search.trim().toLowerCase();
  const filtered = workshops.filter((w) =>
    !q ||
    w.name.toLowerCase().includes(q) ||
    (w.registrationNumber ?? '').toLowerCase().includes(q) ||
    (w.address ?? '').toLowerCase().includes(q) ||
    (w.email ?? '').toLowerCase().includes(q),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workshops</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage accredited repair workshops</p>
        </div>
        <button onClick={() => { setShowCreate((v) => !v); setError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
          {showCreate ? 'Cancel' : '+ Add Workshop'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-sm text-gray-900">New Workshop</h2>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="AutoFix Workshop" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Registration No.</label>
              <input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="REG-001" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="workshop@example.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="+60123456789" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="123 Workshop St, City" />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Workshop'}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, registration, address…"
          className="w-full pl-9 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Workshop</th>
                <th className="text-left px-5 py-3 font-medium">Contact</th>
                <th className="text-left px-5 py-3 font-medium">Accreditation</th>
                <th className="text-right px-5 py-3 font-medium">Risk / Discount</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((w) => (
                <tr key={w.id} className={`hover:bg-gray-50 ${!w.active ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{w.name}</div>
                    {w.registrationNumber && <div className="text-xs text-gray-400 mt-0.5">Reg: {w.registrationNumber}</div>}
                    {w.address && <div className="text-xs text-gray-400 truncate max-w-[200px]">{w.address}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs space-y-0.5">
                    {w.email && <div>{w.email}</div>}
                    {w.phone && <div>{w.phone}</div>}
                    {!w.email && !w.phone && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[w.accreditationStatus]}`}>
                      {w.accreditationStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-gray-500 space-y-0.5">
                    <div>Risk: <span className={`font-medium ${w.riskScore > 0.6 ? 'text-red-600' : w.riskScore > 0.3 ? 'text-yellow-600' : 'text-green-600'}`}>{(w.riskScore * 100).toFixed(0)}%</span></div>
                    <div>Avg discount: {(w.averageNegotiationDiscount * 100).toFixed(1)}%</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${w.active ? 'text-green-600' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${w.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {w.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setEditingWs(w)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleToggleActive(w)}
                        className={`text-xs hover:underline ${w.active ? 'text-red-500' : 'text-blue-500'}`}>
                        {w.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400">
              {search ? 'No workshops match your search.' : 'No workshops registered yet.'}
            </div>
          )}

          {workshops.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t text-xs text-gray-400">
              Showing {filtered.length} of {workshops.length} workshops
            </div>
          )}
        </div>
      )}

      {editingWs && (
        <EditModal workshop={editingWs} onClose={() => setEditingWs(null)} onSaved={load} />
      )}
    </div>
  );
}
