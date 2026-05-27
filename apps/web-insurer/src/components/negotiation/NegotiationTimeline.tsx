'use client';

import { useState } from 'react';
import { negotiationsApi } from '@/lib/api';
import type { Negotiation, NegotiationOffer } from '@autoclaimx/shared-types';

interface NegotiationTimelineProps {
  negotiation: Negotiation;
  onRefresh?: () => void;
}

export function NegotiationTimeline({ negotiation, onRefresh }: NegotiationTimelineProps) {
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const offers: NegotiationOffer[] = negotiation.offers ?? [];

  async function handleCounter(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await negotiationsApi.counter(negotiation.id, {
        amount: Number(counterAmount),
        message: counterMessage,
      });
      setCounterAmount('');
      setCounterMessage('');
      onRefresh?.();
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
