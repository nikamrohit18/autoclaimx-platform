'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { claimsApi } from '@/lib/api';
import type { Claim, ClaimStatus } from '@autoclaimx/shared-types';

const STATUS_COLORS: Record<ClaimStatus, string> = {
  FNOL_RECEIVED: 'bg-gray-100 text-gray-700',
  MEDIA_PROCESSING: 'bg-yellow-100 text-yellow-700',
  UNDER_ASSESSMENT: 'bg-blue-100 text-blue-700',
  NEGOTIATING: 'bg-purple-100 text-purple-700',
  SETTLED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
  DISPUTED: 'bg-red-100 text-red-700',
};

export function ClaimsTable() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    claimsApi
      .list({ limit: 50 })
      .then((data) => setClaims(data.items))
      .catch(() => setError('Failed to load claims'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading claims...</div>;
  if (error) return <div className="text-sm text-red-600 py-8 text-center">{error}</div>;

  return (
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
          {claims.map((claim) => (
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
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      claim.fraudScore.riskLevel === 'LOW'
                        ? 'bg-green-100 text-green-700'
                        : claim.fraudScore.riskLevel === 'MEDIUM'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {claim.fraudScore.riskLevel}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {claim.negotiation?.finalAmount
                  ? `${claim.currency} ${Number(claim.negotiation.finalAmount).toLocaleString()}`
                  : '—'}
              </td>
            </tr>
          ))}
          {claims.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                No claims found. Create your first claim to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
