'use client';

import { useRef, useState } from 'react';
import type { Negotiation, NegotiationOffer } from '@autoclaimx/shared-types';

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
            <th className="text-right px-3 py-2.5 font-medium">Workshop Ask</th>
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
                    <span className="text-green-600 text-xs">Accepted offer ✓</span>
                  ) : isTerminal && status === 'ESCALATED' ? (
                    <span className="text-amber-600 text-xs">Escalated</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {gap !== null ? (
                    <span className={`text-xs font-medium ${gap === 0 ? 'text-green-600' : gap > 5000 ? 'text-orange-500' : 'text-gray-500'}`}>
                      +{Number(gap).toLocaleString()}
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

// ── main component ────────────────────────────────────────────────────────────

interface NegotiationTimelineProps {
  negotiation: Negotiation;
  onRefresh?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:          'bg-gray-100 text-gray-600',
  OFFER_SENT:       'bg-blue-100 text-blue-700',
  COUNTER_RECEIVED: 'bg-purple-100 text-purple-700',
  AGREED:           'bg-green-100 text-green-700',
  ESCALATED:        'bg-amber-100 text-amber-700',
  ABANDONED:        'bg-gray-100 text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:          'Awaiting AI Analysis',
  OFFER_SENT:       'AI Offer Sent',
  COUNTER_RECEIVED: 'Workshop Counter Received',
  AGREED:           'Agreed',
  ESCALATED:        'Escalated to Adjuster',
  ABANDONED:        'Abandoned',
};

export function NegotiationTimeline({ negotiation, onRefresh }: NegotiationTimelineProps) {
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

  void showToast; // used via onRefresh error paths — keep for future adjuster actions
  void onRefresh;

  const offers: NegotiationOffer[] = negotiation.offers ?? [];
  const { status, currency } = negotiation;

  return (
    <div className={`rounded-lg border p-6 space-y-5 ${
      status === 'AGREED'   ? 'bg-green-50 border-green-300' :
      status === 'ESCALATED'? 'bg-amber-50 border-amber-300' :
      'bg-white border-gray-200'
    }`}>
      {toast && <ToastBanner toast={toast} onClose={dismissToast} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">AI Negotiation</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Round {negotiation.currentRound} / {negotiation.maxRounds}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>

      {/* Settlement banner */}
      {negotiation.finalAmount != null && (
        <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Final settlement: {currency} {Number(negotiation.finalAmount).toLocaleString()}
        </div>
      )}

      {/* Round comparison table */}
      {offers.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Round Summary</h3>
          <RoundTable offers={offers} status={status} currency={currency} />
        </div>
      )}

      {/* Offer conversation bubbles */}
      {offers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Conversation</h3>
          <div className="space-y-3">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className={`flex ${offer.offerer === 'AI' ? 'justify-start' : 'justify-end'}`}
              >
                <div className={`max-w-lg rounded-lg p-4 ${
                  offer.offerer === 'AI' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      {offer.offerer === 'AI' ? 'AI Adjuster' : 'Workshop'} · Round {offer.round}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {offer.currency} {Number(offer.amount).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{offer.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status-specific footers */}
      {status === 'OFFER_SENT' && (
        <div className="text-xs text-center text-gray-400 italic border-t pt-3">
          Workshop portal notified — awaiting their response
        </div>
      )}

      {status === 'COUNTER_RECEIVED' && (
        <div className="flex items-center justify-center gap-2 text-xs text-blue-600 border-t pt-3">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Workshop counter received — AI generating response...
        </div>
      )}

      {status === 'ESCALATED' && (
        <div className="border-t pt-4">
          <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Escalated for Manual Review
            </div>
            <p className="text-sm text-amber-700">
              The AI agent could not reach a settlement within {negotiation.maxRounds} rounds. A human adjuster must now take over.
            </p>
            <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
              <li>Assign a senior adjuster to contact the workshop directly.</li>
              <li>Review the full conversation history above before reaching out.</li>
              <li>Once resolved, update the claim status manually to SETTLED or DISPUTED.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
