'use client';

import { useEffect, useMemo, useState } from 'react';
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

type SortCol = 'claimNumber' | 'incidentDate' | 'status' | 'fraudRisk';
type SortDir = 'asc' | 'desc';

const RISK_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const PAGE_SIZES = [10, 25, 50];

function SortIcon({ col: _col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block text-[10px] ${active ? 'text-blue-600' : 'text-gray-300'}`}>
      {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );
}

export function ClaimsTable() {
  const [claims, setClaims]       = useState<Claim[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [activeStatus, setActiveStatus] = useState<ClaimStatus | 'ALL'>('ALL');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [sortCol, setSortCol]     = useState<SortCol>('incidentDate');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(25);

  useEffect(() => {
    claimsApi
      .list({ limit: 200 })
      .then((data) => setClaims(data.items))
      .catch(() => setError('Failed to load claims'))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;

    return claims.filter((c) => {
      if (activeStatus !== 'ALL' && c.status !== activeStatus) return false;
      if (q) {
        const hit =
          c.claimNumber.toLowerCase().includes(q) ||
          `${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(q) ||
          c.policyNumber.toLowerCase().includes(q) ||
          (c.policyHolderName ?? '').toLowerCase().includes(q) ||
          c.vehiclePlate.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (from || to) {
        const d = new Date(c.incidentDate);
        if (from && d < from) return false;
        if (to   && d > to)   return false;
      }
      return true;
    });
  }, [claims, search, activeStatus, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'claimNumber') {
        cmp = a.claimNumber.localeCompare(b.claimNumber);
      } else if (sortCol === 'incidentDate') {
        cmp = new Date(a.incidentDate).getTime() - new Date(b.incidentDate).getTime();
      } else if (sortCol === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortCol === 'fraudRisk') {
        cmp = (RISK_ORDER[a.fraudScore?.riskLevel ?? ''] ?? -1) -
              (RISK_ORDER[b.fraudScore?.riskLevel ?? ''] ?? -1);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const countByStatus = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  function clearFilters() {
    setSearch(''); setDateFrom(''); setDateTo('');
    setActiveStatus('ALL'); setPage(1);
  }

  const hasActiveFilter = search || dateFrom || dateTo || activeStatus !== 'ALL';

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading claims...</div>;
  if (error)   return <div className="text-sm text-red-600 py-8 text-center">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Search + date filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search claim #, vehicle, policy…"
            className="w-full pl-9 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs text-gray-500 shrink-0">Incident date:</span>
          <input
            type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {hasActiveFilter && (
          <button onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0 self-center">
            Clear all
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200">
        {STATUS_TABS.map(({ key, label }) => {
          const count = key === 'ALL' ? claims.length : (countByStatus[key] ?? 0);
          const isActive = activeStatus === key;
          return (
            <button key={key} onClick={() => { setActiveStatus(key); setPage(1); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
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
              {([
                { key: 'claimNumber' as SortCol,  label: 'Claim #' },
                { key: null,                       label: 'Vehicle' },
                { key: 'incidentDate' as SortCol,  label: 'Incident Date' },
                { key: 'status' as SortCol,        label: 'Status' },
                { key: 'fraudRisk' as SortCol,     label: 'Fraud Risk' },
                { key: null,                       label: 'Settlement' },
              ] as { key: SortCol | null; label: string }[]).map(({ key, label }) => (
                <th key={label}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${key ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}
                  onClick={() => key && toggleSort(key)}>
                  {label}
                  {key && <SortIcon col={key} active={sortCol === key} dir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paged.map((claim) => (
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
                    }`}>{claim.fraudScore.riskLevel}</span>
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
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                  {hasActiveFilter ? 'No claims match your filters.' : 'No claims found. Create your first claim to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Footer: count + pagination */}
        {claims.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-gray-400">
              Showing {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length} claims
              {sorted.length !== claims.length && ` (${claims.length} total)`}
            </div>

            <div className="flex items-center gap-3">
              {/* Page size */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Per page:</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* Page buttons */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-100">‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | '…')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                      ) : (
                        <button key={p} onClick={() => setPage(p as number)}
                          className={`px-2 py-1 text-xs border rounded ${safePage === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
                          {p}
                        </button>
                      )
                    )}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-100">›</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
