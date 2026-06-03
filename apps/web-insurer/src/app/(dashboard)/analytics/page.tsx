'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyticsApi } from '@/lib/api';

interface AnalyticsData {
  totalClaims: number;
  claimsLast30Days: number;
  hasDateFilter: boolean;
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

function exportCsv(data: AnalyticsData) {
  const rows = [
    ['Claim Number', 'Status', 'Risk Level', 'Score %'],
    ...data.topRiskClaims.map((c) => [c.claimNumber, c.status.replace(/_/g, ' '), c.riskLevel, String(c.totalScore)]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acx-top-risk-claims-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    analyticsApi.get({
      startDate: startDate || undefined,
      endDate:   endDate   || undefined,
    })
      .then(setData)
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  function clearDates() { setStartDate(''); setEndDate(''); }

  if (loading && !data) return <div className="text-center py-12 text-sm text-gray-500">Loading analytics...</div>;
  if (!data)            return <div className="text-center py-12 text-sm text-red-600">Failed to load analytics</div>;

  const hasFilter = !!(startDate || endDate);

  const kpis = [
    {
      label: 'Total Claims',
      value: data.totalClaims,
      sub: hasFilter
        ? `${data.claimsLast30Days} in selected range`
        : `${data.claimsLast30Days} in last 30 days`,
    },
    {
      label: 'Negotiations',
      value: data.negotiationStats.total,
      sub: `${data.negotiationStats.agreed} agreed`,
    },
    {
      label: 'Avg Negotiation Savings',
      value: `${data.negotiationStats.avgSavingsPct}%`,
      sub: 'vs workshop estimate',
    },
    {
      label: 'Fraud Detection Rate',
      value: `${data.fraudStats.detectionRate}%`,
      sub: `${data.fraudStats.highRisk} high-risk claims`,
    },
  ];

  const maxCount = Math.max(...Object.values(data.statusCounts), 1);

  return (
    <div className="space-y-8">
      {/* Header + date filter */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">Date range (incident):</span>
          <input
            type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date" value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {hasFilter && (
            <button onClick={clearDates}
              className="text-xs text-gray-500 hover:text-gray-700 underline">
              Clear
            </button>
          )}
          {loading && (
            <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          )}
        </div>
      </div>

      {hasFilter && (
        <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2">
          Showing data for incidents{startDate ? ` from ${new Date(startDate).toLocaleDateString()}` : ''}{endDate ? ` to ${new Date(endDate).toLocaleDateString()}` : ''}
        </div>
      )}

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

      {/* Claims by Status — bar chart with tooltips */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Claims by Status</h2>
        <div className="space-y-3">
          {STATUS_ORDER
            .filter((s) => (data.statusCounts[s] ?? 0) > 0 || s === 'FNOL_RECEIVED')
            .map((status) => {
              const count = data.statusCounts[status] ?? 0;
              const pct   = Math.round((count / maxCount) * 100);
              const label = status.replace(/_/g, ' ');
              return (
                <div key={status} className="flex items-center gap-3" title={`${label}: ${count} claim${count !== 1 ? 's' : ''} (${Math.round(count / Math.max(data.totalClaims, 1) * 100)}%)`}>
                  <div className="w-36 text-xs text-gray-600 shrink-0">{label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden group relative cursor-default">
                    <div
                      className={`h-full rounded-full transition-all ${STATUS_COLORS[status] ?? 'bg-gray-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                    {count > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                        {Math.round(count / Math.max(data.totalClaims, 1) * 100)}%
                      </span>
                    )}
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
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Top Fraud Risk Claims</h2>
            <button
              onClick={() => exportCsv(data)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border rounded-md hover:bg-gray-50 transition-colors"
              title="Export as CSV"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Export CSV
            </button>
          </div>
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
                <tr key={c.claimId} className="hover:bg-gray-50" title={`Score: ${c.totalScore}%`}>
                  <td className="py-2 font-mono text-xs text-gray-900">{c.claimNumber}</td>
                  <td className="py-2 text-xs text-gray-600">{c.status.replace(/_/g, ' ')}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RISK_COLORS[c.riskLevel] ?? ''}`}>
                      {c.riskLevel}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${c.totalScore}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-900 w-8 text-right">{c.totalScore}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
