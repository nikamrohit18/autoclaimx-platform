'use client';

import { useRef, useState } from 'react';
import { negotiationsApi } from '@/lib/api';
import type { Negotiation, NegotiationOffer } from '@autoclaimx/shared-types';

type Toast = { message: string; type: 'info' | 'success' | 'error' };

interface NegotiationTimelineProps {
  negotiation: Negotiation;
  onRefresh?: () => void;
}

export function NegotiationTimeline({ negotiation, onRefresh }: NegotiationTimelineProps) {
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, type: Toast['type'], duration = 4000) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    if (duration > 0) {
      toastTimer.current = setTimeout(() => setToast(null), duration);
    }
  }

  const offers: NegotiationOffer[] = negotiation.offers ?? [];

  async function handleCounter(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    showToast('Counter submitted — waiting for AI response...', 'info', 0);
    try {
      await negotiationsApi.counter(negotiation.id, {
        amount: Number(counterAmount),
        message: counterMessage,
      });
      setCounterAmount('');
      setCounterMessage('');
      onRefresh?.();
      showToast('AI response received.', 'success');
    } catch {
      showToast('Submission failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: 'Awaiting AI Analysis',
    OFFER_SENT: 'AI Offer Sent',
    COUNTER_RECEIVED: 'Workshop Counter Received',
    AGREED: 'Agreed',
    ESCALATED: 'Escalated to Adjuster',
    ABANDONED: 'Abandoned',
  };

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-gray-800'
        }`}>
          {toast.type === 'info' && (
            <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          )}
          {toast.message}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Negotiation</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Round {negotiation.currentRound} / {negotiation.maxRounds}
          </span>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
            {statusLabel[negotiation.status] ?? negotiation.status}
          </span>
        </div>
      </div>

      {negotiation.finalAmount != null && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm font-medium">
          Final settlement: {negotiation.currency} {Number(negotiation.finalAmount).toLocaleString()}
        </div>
      )}

      <div className="space-y-3">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className={`flex ${offer.offerer === 'AI' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-lg rounded-lg p-4 ${
                offer.offerer === 'AI' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-200'
              }`}
            >
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

      {negotiation.status === 'OFFER_SENT' && (
        <div className="text-xs text-center text-gray-400 italic">
          Workshop portal notified — awaiting response
        </div>
      )}

      {negotiation.status === 'ESCALATED' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md text-sm">
          Escalated for manual adjuster review
        </div>
      )}
    </div>
  );
}
