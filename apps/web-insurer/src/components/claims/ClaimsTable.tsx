'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { claimsApi } from '@/lib/api';
import type { Claim, ClaimStatus } from '@autoclaimx/shared-types';

const STATUS_COLORS: Record<ClaimStatus, string> = {
  FNOL_RECEIVED:    'bg-gray-100 text-gray-700',
  MEDIA_PROCESSING: 'bg-yellow-100 text-yellow-700',
  UNDER_ASSESSMENT: 'bg-blue-100 text-blue-700',
  NEGOTIATING:      'bg-purple-100 text-purple-700',
  SETTLED:          'bg-green-100 text-green-700',
  CLOSED:           'bg-gray-100 text-gray-500',
  DISPUTED:         'bg-red-100 text-red-700',
};

const STATUS_TABS: { key: ClaimStatus | 'ALL'; label: string }[] = [
  { key: 'ALL',             label: 'All' },
  { key: 'FNOL_RECEIVED',   label: 'FNOL' },
  { key: 'MEDIA_PROCESSING',label: 'Processing' },
  { key: 'UNDER_ASSESSMENT',label: 'Assessment' },
  { key: 'NEGOTIATING',     label: 'Negotiating' },
  { key: 'SETTLED',         label: 'Settled' },
  { key: 'DISPUTED',        label: 'Disputed' },
];

export function ClaimsTable() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<ClaimStatus | 'ALL'>('ALL');

  useEffect(() => {
    claimsApi
      .list({ limit: 50 })
      .then((data) => setClaims(data.items))
      .catch(() => setError('Failed to load claims'))
      .finally(() => setLoading(false));
  }, []);

  // Client-side filter — search across claim #, vehicle, policy, policyholder
  const q = search.trim().toLowerCase();
  const filtered = claims.filter((c) => {
    const matchesStatus = activeStatus === 'ALL' || c.status === activeStatus;
    const matchesSearch =
      !q ||
      c.claimNumber.toLowerCase().includes(q) ||
      `${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(q) ||
      c.policyNumber.toLowerCase().includes(q) ||
      (c.policyHolderName ?? '').toLowerCase().includes(q) ||
      c.vehiclePlate.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  // Count per status for tab badges
  const countByStatus = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading claims...</div>;
  if (error) return <div className="text-sm text-red-600 py-8 text-center">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Search + filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claim #, vehicle, policy…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200">
        {STATUS_TABS.map(({ key, label }) => {
          const count = key === 'ALL' ? claims.length : (countByStatus[key] ?? 0);
          const isActive = activeStatus === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStatus(key)}
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

      {/* Table */}
      <div className="bg-white shadow-sm rounded-lg border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Claim #', 'Vehicle', 'Incident Date', 'Status', 'Fraud Risk', 'Settlement'].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((claim) => (
              <tr key={claim.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm">
                  <Link href={`/claims/${claim.id}`} className="text-blue-600 hover:underline font-medium">
                    {claim.claimNumber}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                  <div className="text-xs text-gray-400">{claim.vehiclePlate}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(claim.incidentDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[claim.status]}`}>
                    {claim.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {claim.fraudScore ? (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      claim.fraudScore.riskLevel === 'LOW'    ? 'bg-green-100 text-green-700' :
                      claim.fraudScore.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                                                 'bg-red-100 text-red-700'
                    }`}>
                      {claim.fraudScore.riskLevel}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {claim.negotiation?.finalAmount
                    ? `${claim.currency} ${Number(claim.negotiation.finalAmount).toLocaleString()}`
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                  {search || activeStatus !== 'ALL'
                    ? 'No claims match your filters.'
                    : 'No claims found. Create your first claim to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Footer count */}
        {claims.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-400">
            Showing {filtered.length} of {claims.length} claims
          </div>
        )}
      </div>
    </div>
  );
}
