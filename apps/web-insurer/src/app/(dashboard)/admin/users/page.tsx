'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  workshopId?: string;
  active: boolean;
  createdAt: string;
}

const ROLES = ['INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF', 'FLEET_ADMIN', 'POLICYHOLDER'];
const ROLE_COLORS: Record<string, string> = {
  INSURER_ADMIN:  'bg-purple-100 text-purple-700',
  ADJUSTER:       'bg-blue-100 text-blue-700',
  WORKSHOP_ADMIN: 'bg-orange-100 text-orange-700',
  WORKSHOP_STAFF: 'bg-yellow-100 text-yellow-700',
  FLEET_ADMIN:    'bg-teal-100 text-teal-700',
  POLICYHOLDER:   'bg-gray-100 text-gray-600',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ADJUSTER', workshopId: '' });
  const [error, setError] = useState('');

  const loadUsers = () =>
    adminApi.listUsers().then(setUsers).finally(() => setLoading(false));

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.createUser({
        name: form.name,
        email: form.email || undefined,
        password: form.password || undefined,
        role: form.role,
        workshopId: form.workshopId || undefined,
      });
      setForm({ name: '', email: '', password: '', role: 'ADJUSTER', workshopId: '' });
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    await adminApi.updateUser(id, { active: false });
    await loadUsers();
  }

  async function handleReactivate(id: string) {
    await adminApi.updateUser(id, { active: true });
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage staff and portal access</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">New User</h2>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Jane Smith" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="jane@insurer.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Min 8 characters" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {(form.role === 'WORKSHOP_ADMIN' || form.role === 'WORKSHOP_STAFF') && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Workshop ID</label>
                <input value={form.workshopId} onChange={(e) => setForm({ ...form, workshopId: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="UUID" />
              </div>
            )}
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {loading && <div className="text-center py-12 text-sm text-gray-500">Loading users...</div>}

      {!loading && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email / Phone</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email ?? u.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${u.active ? 'text-green-600' : 'text-gray-400'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.active ? (
                      <button onClick={() => handleDeactivate(u.id)}
                        className="text-xs text-red-500 hover:underline">Deactivate</button>
                    ) : (
                      <button onClick={() => handleReactivate(u.id)}
                        className="text-xs text-blue-500 hover:underline">Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400">No users found</div>
          )}
        </div>
      )}
    </div>
  );
}
