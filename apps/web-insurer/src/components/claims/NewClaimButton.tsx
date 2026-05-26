'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimsApi } from '@/lib/api';

export function NewClaimButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [form, setForm] = useState({
    policyNumber: '',
    policyHolderId: '',
    vehiclePlate: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: new Date().getFullYear(),
    incidentDate: new Date().toISOString().slice(0, 10),
    incidentDescription: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const claim = await claimsApi.create(form);
      router.push(`/claims/${claim.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        + New Claim
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create New Claim</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {[
                { label: 'Policy Number', key: 'policyNumber', type: 'text' },
                { label: 'Policy Holder ID', key: 'policyHolderId', type: 'text' },
                { label: 'Vehicle Plate', key: 'vehiclePlate', type: 'text' },
                { label: 'Make', key: 'vehicleMake', type: 'text' },
                { label: 'Model', key: 'vehicleModel', type: 'text' },
                { label: 'Year', key: 'vehicleYear', type: 'number' },
                { label: 'Incident Date', key: 'incidentDate', type: 'date' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type={type}
                    required
                    value={String(form[key as keyof typeof form])}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
