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

// ── constants ─────────────────────────────────────────────────────────────────

const ALL_ROLES = ['INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF', 'FLEET_ADMIN', 'POLICYHOLDER'];

const ROLE_COLORS: Record<string, string> = {
  INSURER_ADMIN:  'bg-purple-100 text-purple-700',
  ADJUSTER:       'bg-blue-100 text-blue-700',
  WORKSHOP_ADMIN: 'bg-orange-100 text-orange-700',
  WORKSHOP_STAFF: 'bg-yellow-100 text-yellow-700',
  FLEET_ADMIN:    'bg-teal-100 text-teal-700',
  POLICYHOLDER:   'bg-gray-100 text-gray-600',
};

const ROLE_LABEL: Record<string, string> = {
  INSURER_ADMIN:  'Insurer Admin',
  ADJUSTER:       'Adjuster',
  WORKSHOP_ADMIN: 'Workshop Admin',
  WORKSHOP_STAFF: 'Workshop Staff',
  FLEET_ADMIN:    'Fleet Admin',
  POLICYHOLDER:   'Policyholder',
};

type TabKey = 'ALL' | 'INSURER' | 'WORKSHOP' | 'FLEET' | 'POLICYHOLDER';

const TABS: { key: TabKey; label: string; roles?: string[] }[] = [
  { key: 'ALL',         label: 'All' },
  { key: 'INSURER',     label: 'Insurer Staff',  roles: ['INSURER_ADMIN', 'ADJUSTER'] },
  { key: 'WORKSHOP',    label: 'Workshop',        roles: ['WORKSHOP_ADMIN', 'WORKSHOP_STAFF'] },
  { key: 'FLEET',       label: 'Fleet',           roles: ['FLEET_ADMIN'] },
  { key: 'POLICYHOLDER',label: 'Policyholders',   roles: ['POLICYHOLDER'] },
];

const BLANK_CREATE = { name: '', email: '', phone: '', password: '', role: 'ADJUSTER', workshopId: '' };
const BLANK_EDIT   = { name: '', role: '', active: true };

// ── edit modal ────────────────────────────────────────────────────────────────

function EditModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: user.name, role: user.role, active: user.active });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.updateUser(user.id, { name: form.name, role: form.role, active: form.active });
      onSaved();
      onClose();
    } catch {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Edit User</h2>
            <p className="text-xs text-gray-400 mt-0.5">{user.email ?? user.phone ?? user.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role *</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between py-2 border rounded-md px-3">
            <div>
              <div className="text-sm font-medium text-gray-700">Account Active</div>
              <div className="text-xs text-gray-400">Inactive users cannot log in</div>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, active: !form.active })}
              className={`relative w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border text-sm rounded-md text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [form, setForm] = useState(BLANK_CREATE);

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
        phone: form.phone || undefined,
        password: form.password || undefined,
        role: form.role,
        workshopId: form.workshopId || undefined,
      });
      setForm(BLANK_CREATE);
      setShowCreate(false);
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

  // Filtering
  const tabRoles = TABS.find((t) => t.key === activeTab)?.roles;
  const q = search.trim().toLowerCase();
  const filtered = users.filter((u) => {
    const matchesTab = !tabRoles || tabRoles.includes(u.role);
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.phone ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const countByTab = (roles?: string[]) =>
    users.filter((u) => !roles || roles.includes(u.role)).length;

  const needsWorkshopId = form.role === 'WORKSHOP_ADMIN' || form.role === 'WORKSHOP_STAFF';
  const needsPhone = form.role === 'POLICYHOLDER';

  void BLANK_EDIT; // referenced indirectly via EditModal

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage staff accounts and portal access</p>
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setError(''); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showCreate ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">New User</h2>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </div>

            {!needsPhone && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email {!needsPhone && '(login username)'}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="jane@insurer.com"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone {needsPhone && '(OTP login)'}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="+60123456789"
              />
            </div>

            {!needsPhone && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Min 8 characters"
                />
              </div>
            )}

            {needsWorkshopId && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Workshop ID</label>
                <input
                  value={form.workshopId}
                  onChange={(e) => setForm({ ...form, workshopId: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm font-mono"
                  placeholder="UUID"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {/* Search + tabs */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full pl-9 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
              ×
            </button>
          )}
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(({ key, label, roles }) => {
            const count = countByTab(roles);
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading users...</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.email ? (
                      <span>{u.email}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.phone ? (
                      <span>{u.phone}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.active ? 'text-green-600' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {u.active ? (
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(u.id)}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400">
              {search || activeTab !== 'ALL' ? 'No users match your filters.' : 'No users found.'}
            </div>
          )}

          {users.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-400">
              Showing {filtered.length} of {users.length} users
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}
