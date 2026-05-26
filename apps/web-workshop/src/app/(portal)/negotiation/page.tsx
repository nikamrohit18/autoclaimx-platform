'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface Offer {
  id: string;
  round: number;
  offerer: 'AI' | 'WORKSHOP';
  amount: number;
  currency: string;
  message: string;
  createdAt: string;
}

interface Session {
  id: string;
  claimId: string;
  status: string;
  currentRound: number;
  maxRounds: number;
  finalAmount?: number;
  currency: string;
  offers: Offer[];
}

export default function NegotiationPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // In production this fetches from the API using the workshop's JWT
  // placeholder: no sessions until wired to API
  const token = typeof window !== 'undefined' ? localStorage.getItem('acx_access_token') : '';

  async function handleCounter(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/api/v1/claims/${selected.claimId}/negotiation/counter`,
        { sessionId: selected.id, amount: Number(counterAmount), message: counterMessage },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCounterAmount('');
      setCounterMessage('');
      // Refresh
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Negotiation Center</h1>

      {sessions.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-lg border">
          No active negotiations. You will be notified when an insurer initiates a negotiation.
        </div>
      )}

      {selected && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Claim {selected.claimId}</h2>
            <span className="text-sm text-gray-500">Round {selected.currentRound}/{selected.maxRounds}</span>
          </div>

          <div className="space-y-3">
            {selected.offers.map((offer) => (
              <div key={offer.id} className={`p-4 rounded-lg ${offer.offerer === 'AI' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">{offer.offerer === 'AI' ? 'Insurance AI' : 'Your Offer'} · Round {offer.round}</span>
                  <span className="font-semibold text-gray-900">{offer.currency} {offer.amount.toLocaleString()}</span>
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
                  onClick={() => {/* Accept current AI offer */}}
                  className="px-4 py-2 border border-green-500 text-green-600 text-sm rounded hover:bg-green-50"
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

          {selected.status === 'AGREED' && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm font-medium">
              Agreed: {selected.currency} {Number(selected.finalAmount ?? 0).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
