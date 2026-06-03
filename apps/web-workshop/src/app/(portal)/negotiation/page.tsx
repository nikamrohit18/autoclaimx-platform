'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { workshopsApi, negotiationsApi, NegotiationSession, NegotiationOffer } from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

type RoundEntry = { round: number; ai?: NegotiationOffer; workshop?: NegotiationOffer };

function buildRounds(offers: NegotiationOffer[]): RoundEntry[] {
  const byRound = new Map<number, RoundEntry>();
  for (const o of offers) {
    const entry = byRound.get(o.round) ?? { round: o.round };
    if (o.offerer === 'AI') entry.ai = o;
    else entry.workshop = o;
    byRound.set(o.round, entry);
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

// ── sub-components ────────────────────────────────────────────────────────────

type Toast = { message: string; type: 'info' | 'success' | 'error' };

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const bg =
    toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'error'   ? 'bg-red-600'   : 'bg-gray-800';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-3 ${bg}`}>
      {toast.type === 'info' && (
        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      )}
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-2 text-white/70 hover:text-white text-base leading-none shrink-0" aria-label="Dismiss">×</button>
    </div>
  );
}

function PendingBanner() {
  return (
    <div className="border-t pt-4 flex items-center gap-3 text-sm bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
      <svg className="w-4 h-4 animate-spin shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      <span className="font-medium text-blue-700">Counter-offer submitted — waiting for AI response...</span>
    </div>
  );
}

function EscalatedBanner({ claimNumber }: { claimNumber?: string }) {
  return (
    <div className="border-t pt-4">
      <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-4 space-y-2">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Human Intervention Required
        </div>
        <p className="text-sm text-amber-700">
          The AI was unable to reach an agreement within the allowed rounds
          {claimNumber ? ` for claim ${claimNumber}` : ''}. This case has been escalated.
        </p>
        <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
          <li>The insurer&apos;s adjuster team has been notified automatically.</li>
          <li>No further action required from your side at this time.</li>
          <li>An adjuster will contact you directly to negotiate terms.</li>
        </ul>
      </div>
    </div>
  );
}

function RoundTable({
  offers,
  status,
  currency,
}: {
  offers: NegotiationOffer[];
  status: string;
  currency: string;
}) {
  const rounds = buildRounds(offers);
  if (rounds.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <th className="text-left px-3 py-2.5 font-medium w-12">Rnd</th>
            <th className="text-right px-3 py-2.5 font-medium">AI Offer</th>
            <th className="text-right px-3 py-2.5 font-medium">Your Counter</th>
            <th className="text-right px-3 py-2.5 font-medium">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rounds.map(({ round, ai, workshop }, idx) => {
            const prevEntry = idx > 0 ? rounds[idx - 1] : null;
            const gap = ai && workshop ? workshop.amount - ai.amount : null;
            const prevGap = prevEntry?.ai && prevEntry?.workshop
              ? prevEntry.workshop.amount - prevEntry.ai.amount : null;
            const isClosing = gap !== null && prevGap !== null && Math.abs(gap) < Math.abs(prevGap);
            const isLast = idx === rounds.length - 1;
            const isTerminal = isLast && (status === 'AGREED' || status === 'ESCALATED');
            const rowBg = isTerminal && status === 'AGREED' ? 'bg-green-50' :
                          isTerminal && status === 'ESCALATED' ? 'bg-amber-50' : '';

            return (
              <tr key={round} className={rowBg}>
                <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{round}</td>
                <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                  {ai ? `${currency} ${Number(ai.amount).toLocaleString()}` : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-medium">
                  {workshop ? (
                    <span className="text-gray-900">{currency} {Number(workshop.amount).toLocaleString()}</span>
                  ) : isTerminal && status === 'AGREED' ? (
                    <span className="text-green-600 text-xs">Accepted ✓</span>
                  ) : isTerminal && status === 'ESCALATED' ? (
                    <span className="text-amber-600 text-xs">Escalated</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {gap !== null ? (
                    <span className={`text-xs font-medium ${gap === 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {gap > 0 ? '+' : ''}{Number(Math.abs(gap)).toLocaleString()}
                      {isClosing && <span className="ml-1 text-green-500" title="Gap closing">↘</span>}
                    </span>
                  ) : isTerminal && status === 'AGREED' ? (
                    <span className="text-xs text-green-600 font-medium">Settled</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

interface LineItem { label: string; amount: string }

const DEFAULT_LINE_ITEMS: LineItem[] = [
  { label: 'Labour', amount: '' },
  { label: 'Parts',  amount: '' },
  { label: 'Other',  amount: '' },
];

export default function NegotiationPage() {
  const [workshopId, setWorkshopId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [selected, setSelected] = useState<NegotiationSession | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>(DEFAULT_LINE_ITEMS.map((li) => ({ ...li })));
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }

  function showToast(message: string, type: Toast['type'], duration = 3000) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    if (duration > 0) toastTimer.current = setTimeout(() => setToast(null), duration);
  }

  const loadSessions = useCallback(async (wId: string) => {
    const data = await negotiationsApi.getByWorkshop(wId);
    setSessions(data);
    if (selected) {
      const refreshed = data.find((s) => s.id === selected.id);
      if (refreshed) setSelected(refreshed);
    }
  }, [selected]);

  useEffect(() => {
    workshopsApi.list().then((ws) => {
      if (ws.length === 0) { setLoading(false); return; }
      const wId = ws[0].id;
      setWorkshopId(wId);
      return loadSessions(wId);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  function updateLineItem(idx: number, amount: string) {
    setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, amount } : li));
  }

  async function handleCounter(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !workshopId || lineItemsTotal <= 0) return;
    setSubmitting(true);
    showToast('Counter-offer submitted — waiting for AI response...', 'info', 0);
    try {
      const breakdown = lineItems
        .filter((li) => Number(li.amount) > 0)
        .map((li) => ({ label: li.label, amount: Number(li.amount) }));
      const message = counterMessage.trim()
        || breakdown.map((li) => `${li.label}: ${selected.currency} ${Number(li.amount).toLocaleString()}`).join(', ');
      await negotiationsApi.counter(selected.id, { amount: lineItemsTotal, message });
      setLineItems(DEFAULT_LINE_ITEMS.map((li) => ({ ...li })));
      setCounterMessage('');
      await loadSessions(workshopId);
      showToast('AI response received.', 'success');
    } catch {
      showToast('Submission failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!selected || !workshopId) return;
    setSubmitting(true);
    showToast('Accepting AI offer — please wait...', 'info', 0);
    try {
      const latestAiOffer = [...selected.offers].reverse().find((o) => o.offerer === 'AI');
      if (!latestAiOffer) return;
      await negotiationsApi.counter(selected.id, { amount: latestAiOffer.amount, message: 'Accepted AI offer.' });
      await loadSessions(workshopId);
      showToast('Offer accepted. Settlement confirmed.', 'success');
    } catch {
      showToast('Failed to accept offer. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: 'Pending',
    OFFER_SENT: 'AI Offer Sent',
    COUNTER_RECEIVED: 'Counter Received',
    AGREED: 'Agreed',
    ESCALATED: 'Human Review',
    ABANDONED: 'Abandoned',
  };

  function cardBg(status: string) {
    if (status === 'AGREED') return 'bg-green-50 border-green-300';
    if (status === 'ESCALATED') return 'bg-amber-50 border-amber-300';
    return 'bg-white border-gray-200';
  }

  function badgeClass(status: string) {
    if (status === 'AGREED') return 'bg-green-100 text-green-700';
    if (status === 'ESCALATED') return 'bg-amber-100 text-amber-700';
    if (status === 'OFFER_SENT') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  }

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      {toast && <ToastBanner toast={toast} onClose={dismissToast} />}
      <h1 className="text-2xl font-semibold text-gray-900">Negotiation Center</h1>

      {sessions.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-lg border">
          No active negotiations. You will be notified when an insurer initiates a negotiation.
        </div>
      )}

      {/* ── Session list ── */}
      {sessions.length > 0 && !selected && (
        <div className="space-y-3">
          {sessions.map((s) => {
            const lastAi = [...s.offers].reverse().find((o) => o.offerer === 'AI');
            const lastWs = [...s.offers].reverse().find((o) => o.offerer === 'WORKSHOP');
            // Savings vs original workshop estimate total (preferred); fallback to first counter-offer
            const estimateTotal = Number(s.workshopEstimate?.total ?? 0);
            const firstWs = s.offers.find((o) => o.offerer === 'WORKSHOP');
            const savingsBase = estimateTotal > 0 ? estimateTotal : (firstWs?.amount ?? 0);
            const savingsPct = savingsBase > 0 && s.finalAmount
              ? ((savingsBase - s.finalAmount) / savingsBase * 100).toFixed(1)
              : null;
            const savingsLabel = estimateTotal > 0 ? 'below estimate' : 'below first ask';

            return (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left rounded-lg border p-4 hover:border-blue-300 transition-colors ${cardBg(s.status)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm">
                      {s.claim?.claimNumber ?? s.claimId.slice(0, 8) + '…'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {s.claim
                        ? `${s.claim.vehicleMake} ${s.claim.vehicleModel} (${s.claim.vehicleYear}) · ${s.claim.vehiclePlate}`
                        : `Round ${s.currentRound}/${s.maxRounds}`}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Round {s.currentRound}/{s.maxRounds}</div>

                    {/* Amount summary */}
                    {s.status === 'AGREED' && s.finalAmount ? (
                      <div className="text-xs text-green-700 mt-1.5 font-medium">
                        Settled {s.currency} {Number(s.finalAmount).toLocaleString()}
                        {savingsPct && ` · ${savingsPct}% ${savingsLabel}`}
                      </div>
                    ) : lastAi ? (
                      <div className="text-xs text-gray-400 mt-1.5">
                        AI: {s.currency} {Number(lastAi.amount).toLocaleString()}
                        {lastWs && ` · Your ask: ${s.currency} ${Number(lastWs.amount).toLocaleString()}`}
                      </div>
                    ) : null}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass(s.status)}`}>
                    {statusLabel[s.status] ?? s.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Session detail ── */}
      {selected && (
        <div className={`rounded-lg border p-6 space-y-5 ${
          selected.status === 'AGREED' ? 'bg-green-50 border-green-300' :
          selected.status === 'ESCALATED' ? 'bg-amber-50 border-amber-300' :
          'bg-white border-gray-200'
        }`}>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <button onClick={() => setSelected(null)} className="text-xs text-blue-600 hover:underline mb-1">
                ← All negotiations
              </button>
              <h2 className="font-semibold text-gray-900">
                {selected.claim?.claimNumber ?? selected.claimId.slice(0, 8) + '…'}
              </h2>
              {selected.claim && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.claim.vehicleMake} {selected.claim.vehicleModel} ({selected.claim.vehicleYear}) · {selected.claim.vehiclePlate}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">Round {selected.currentRound}/{selected.maxRounds}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass(selected.status)}`}>
                {statusLabel[selected.status] ?? selected.status}
              </span>
            </div>
          </div>

          {/* AGREED settlement banner */}
          {selected.status === 'AGREED' && (
            <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Settlement agreed: {selected.currency} {Number(selected.finalAmount ?? 0).toLocaleString()}
            </div>
          )}

          {/* Round comparison table */}
          {selected.offers.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Round Summary</h3>
              <RoundTable offers={selected.offers} status={selected.status} currency={selected.currency} />
            </div>
          )}

          {/* Offer conversation */}
          {selected.offers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Conversation</h3>
              <div className="space-y-3">
                {selected.offers.map((offer) => (
                  <div
                    key={offer.id}
                    className={`p-4 rounded-lg ${offer.offerer === 'AI' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">
                        {offer.offerer === 'AI' ? 'Insurance AI' : 'Your Offer'} · Round {offer.round}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">
                        {offer.currency} {Number(offer.amount).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{offer.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action area */}
          {submitting && <PendingBanner />}

          {!submitting && selected.status === 'OFFER_SENT' && (
            <form onSubmit={handleCounter} className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-sm">Your Counter-Offer</h3>

              {/* Line-item editor */}
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_140px] gap-2 text-xs text-gray-500 px-1">
                  <span>Cost Category</span>
                  <span className="text-right">Amount ({selected.currency})</span>
                </div>
                {lineItems.map((li, idx) => (
                  <div key={li.label} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                    <div className="text-sm text-gray-700 bg-gray-50 border rounded px-3 py-2">{li.label}</div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.amount}
                      onChange={(e) => updateLineItem(idx, e.target.value)}
                      className="border rounded px-3 py-2 text-sm text-right"
                      placeholder="0.00"
                    />
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_140px] gap-2 items-center border-t pt-2 mt-1">
                  <div className="text-sm font-semibold text-gray-900 px-1">Total</div>
                  <div className="text-sm font-bold text-gray-900 text-right pr-1">
                    {selected.currency} {lineItemsTotal > 0 ? Number(lineItemsTotal).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Additional Notes (optional)</label>
                <textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                  placeholder="Explain any special circumstances, part availability, or labour complexity…"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="px-4 py-2 border border-green-500 text-green-600 text-sm rounded hover:bg-green-50"
                >
                  Accept AI Offer
                </button>
                <button
                  type="submit"
                  disabled={lineItemsTotal <= 0}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Submit Counter-Offer
                </button>
              </div>
            </form>
          )}

          {!submitting && selected.status === 'ESCALATED' && (
            <EscalatedBanner claimNumber={selected.claim?.claimNumber} />
          )}
        </div>
      )}
    </div>
  );
}
