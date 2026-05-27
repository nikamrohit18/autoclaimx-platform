'use client';

import { useEffect, useState } from 'react';
import { analyticsApi } from '@/lib/api';

interface AnalyticsData {
  totalClaims: number;
  claimsLast30Days: number;
  statusCounts: Record<string, number>;
  fraudStats: { withScore: number; highRisk: number; detectionRate: number };
  negotiationStats: { total: number; agreed: number; avgSavingsPct: number };
  topRiskClaims: Array<{ claimId: string; claimNumber: string; status: string; riskLevel: string; totalScore: number }>;
}

const STATUS_ORDER = ['FNOL_RECEIVED', 'MEDIA_PROCESSING', 'UNDER_ASSESSMENT', 'NEGOTIATING', 'SETTLED', 'CLOSED', 'DISPUTED'];
const STATUS_COLORS: Record<string, string> = {
  FNOL_RECEIVED:    'bg-gray-400',
  MEDIA_PROCESSING: 'bg-yellow-400',
  UNDER_ASSESSMENT: 'bg-blue-400',
  NEGOTIATING:      'bg-purple-500',
  SETTLED:          'bg-green-500',
  CLOSED:           'bg-gray-600',
  DISPUTED:         'bg-red-500',
};
const RISK_COLORS: Record<string, string> = {
  LOW:      'bg-green-100 text-green-700',
  MEDIUM:   'bg-yellow-100 text-yellow-700',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi.get().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Loading analytics...</div>;
  if (!data) return <div className="text-center py-12 text-sm text-red-600">Failed to load analytics</div>;

  const kpis = [
    { label: 'Total Claims', value: data.totalClaims, sub: `${data.claimsLast30Days} in last 30 days` },
    { label: 'Negotiations', value: data.negotiationStats.total, sub: `${data.negotiationStats.agreed} agreed` },
    { label: 'Avg Negotiation Savings', value: `${data.negotiationStats.avgSavingsPct}%`, sub: 'vs workshop estimate' },
    { label: 'Fraud Detection Rate', value: `${data.fraudStats.detectionRate}%`, sub: `${data.fraudStats.highRisk} high-risk claims` },
  ];

  const maxCount = Math.max(...Object.values(data.statusCounts), 1);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-lg border p-5 space-y-1">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-400">{sub}</div>
          </div>
        ))}
      </div>

      {/* Claims by Status */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Claims by Status</h2>
        <div className="space-y-3">
          {STATUS_ORDER.filter((s) => (data.statusCounts[s] ?? 0) > 0 || s === 'FNOL_RECEIVED').map((status) => {
            const count = data.statusCounts[status] ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={status} className="flex items-center gap-3">
                <div className="w-36 text-xs text-gray-600 shrink-0">{status.replace(/_/g, ' ')}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_COLORS[status] ?? 'bg-gray-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-8 text-xs text-gray-700 text-right shrink-0">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Risk Claims */}
      {data.topRiskClaims.length > 0 && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Top Fraud Risk Claims</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2">Claim</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Risk Level</th>
                <th className="text-right py-2">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.topRiskClaims.map((c) => (
                <tr key={c.claimId} className="hover:bg-gray-50">
                  <td className="py-2 font-mono text-xs text-gray-900">{c.claimNumber}</td>
                  <td className="py-2 text-xs text-gray-600">{c.status.replace(/_/g, ' ')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLORS[c.riskLevel] ?? ''}`}>
                      {c.riskLevel}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs font-semibold text-gray-900">{c.totalScore}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
