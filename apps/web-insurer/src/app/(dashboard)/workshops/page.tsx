'use client';

import { useEffect, useState } from 'react';
import { workshopsApi } from '@/lib/api';
import type { Workshop } from '@autoclaimx/shared-types';

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workshopsApi.list().then(setWorkshops).finally(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    APPROVED: 'bg-green-100 text-green-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    SUSPENDED: 'bg-red-100 text-red-700',
    REJECTED: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Workshops</h1>

      {loading && <div className="text-center py-12 text-sm text-gray-500">Loading...</div>}

      {!loading && workshops.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400 bg-white rounded-lg border">
          No workshops registered yet.
        </div>
      )}

      <div className="grid gap-4">
        {workshops.map((w) => (
          <div key={w.id} className="bg-white rounded-lg border p-5 flex items-start justify-between">
            <div className="space-y-1">
              <div className="font-medium text-gray-900">{w.name}</div>
              {w.registrationNumber && (
                <div className="text-xs text-gray-500">Reg: {w.registrationNumber}</div>
              )}
              {w.address && <div className="text-xs text-gray-500">{w.address}</div>}
              <div className="text-xs text-gray-500">
                Risk score: {(w.riskScore * 100).toFixed(0)}% · Avg discount: {(w.averageNegotiationDiscount * 100).toFixed(1)}%
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[w.accreditationStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                {w.accreditationStatus}
              </span>
              <span className="text-xs text-gray-400 font-mono">{w.id.slice(0, 8)}…</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
