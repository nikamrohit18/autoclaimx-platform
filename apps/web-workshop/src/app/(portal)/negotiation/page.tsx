'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { workshopsApi, negotiationsApi, NegotiationSession } from '@/lib/api';

type Toast = { message: string; type: 'info' | 'success' | 'error' };

function ToastBanner({ toast }: { toast: Toast }) {
  const bg =
    toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'error'   ? 'bg-red-600'   : 'bg-gray-800';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-2 ${bg}`}>
      {toast.type === 'info' && (
        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      )}
      {toast.message}
    </div>
  );
}

export default function NegotiationPage() {
  const [workshopId, setWorkshopId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [selected, setSelected] = useState<NegotiationSession | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, type: Toast['type'], duration = 4000) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    if (duration > 0) {
      toastTimer.current = setTimeout(() => setToast(null), duration);
    }
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

  async function handleCounter(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !workshopId) return;
    setSubmitting(true);
    showToast('Counter-offer submitted — waiting for AI response...', 'info', 0);
    try {
      await negotiationsApi.counter(selected.id, {
        amount: Number(counterAmount),
        message: counterMessage,
      });
      setCounterAmount('');
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
      await negotiationsApi.counter(selected.id, {
        amount: latestAiOffer.amount,
        message: 'Accepted AI offer.',
      });
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
    ESCALATED: 'Escalated',
    ABANDONED: 'Abandoned',
  };

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      {toast && <ToastBanner toast={toast} />}
      <h1 className="text-2xl font-semibold text-gray-900">Negotiation Center</h1>

      {sessions.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-lg border">
          No active negotiations. You will be notified when an insurer initiates a negotiation.
        </div>
      )}

      {sessions.length > 0 && !selected && (
        <div className="space-y-3">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="w-full text-left bg-white rounded-lg border p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 text-sm">
                    {s.claim?.claimNumber ?? s.claimId.slice(0, 8) + '…'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.claim
                      ? `${s.claim.vehicleMake} ${s.claim.vehicleModel} (${s.claim.vehicleYear}) · ${s.claim.vehiclePlate}`
                      : `Round ${s.currentRound}/${s.maxRounds}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">Round {s.currentRound}/{s.maxRounds}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  s.status === 'AGREED' ? 'bg-green-100 text-green-700' :
                  s.status === 'ESCALATED' ? 'bg-yellow-100 text-yellow-700' :
                  s.status === 'OFFER_SENT' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {statusLabel[s.status] ?? s.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
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
            <span className="text-sm text-gray-500">Round {selected.currentRound}/{selected.maxRounds}</span>
          </div>

          {selected.status === 'AGREED' && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm font-medium">
              Agreed: {selected.currency} {Number(selected.finalAmount ?? 0).toLocaleString()}
            </div>
          )}

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
                  <span className="font-semibold text-gray-900">
                    {offer.currency} {Number(offer.amount).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{offer.message}</p>
              </div>
            ))}
          </div>

          {selected.status === 'OFFER_SENT' && (
            <form onSubmit={handleCounter} className="space-y-3 border-t pt-4">
              <h3 className="font-medium text-sm">Your Counter-Offer</h3>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount ({selected.currency})</label>
                <input
                  type="number"
                  required
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Enter your counter-offer amount"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Message / Justification</label>
                <textarea
                  required
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                  placeholder="Explain your pricing (e.g. part availability, labor complexity)..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={submitting}
                  className="px-4 py-2 border border-green-500 text-green-600 text-sm rounded hover:bg-green-50 disabled:opacity-50"
                >
                  Accept AI Offer
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Counter-Offer'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
