'use client';

import { useEffect, useState } from 'react';
import { claimsApi } from '@/lib/api';
import { DamageViewer } from '@/components/damage/DamageViewer';
import { FraudScoreCard } from '@/components/fraud/FraudScoreCard';
import { NegotiationTimeline } from '@/components/negotiation/NegotiationTimeline';
import type { Claim } from '@autoclaimx/shared-types';

interface ClaimDetailProps {
  claimId: string;
}

export function ClaimDetail({ claimId }: ClaimDetailProps) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    claimsApi.get(claimId).then(setClaim).finally(() => setLoading(false));

    // WebSocket: subscribe to real-time claim updates
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';
    const token = localStorage.getItem('acx_access_token');
    // Socket.io connection would go here (wired in Week 3-4)
  }, [claimId]);

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Loading claim...</div>;
  if (!claim) return <div className="text-center py-12 text-sm text-red-600">Claim not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{claim.claimNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear} · {claim.vehiclePlate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {claim.status.replace(/_/g, ' ')}
          </span>
          {claim.negotiation && (
            <span className="text-sm text-gray-500">
              Settlement: <strong>{claim.negotiation.currency} {Number(claim.negotiation.finalAmount ?? 0).toLocaleString()}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Claim Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Policy', value: claim.policyNumber },
          { label: 'Incident Date', value: new Date(claim.incidentDate).toLocaleDateString() },
          { label: 'Policy Holder', value: claim.policyHolderId },
          { label: 'VIN', value: claim.vehicleVin ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg border p-4">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-sm font-medium text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* AI Damage Report */}
      {claim.damageReport && <DamageViewer damageReport={claim.damageReport} />}

      {/* Fraud Score */}
      {claim.fraudScore && <FraudScoreCard fraudScore={claim.fraudScore} />}

      {/* Negotiation */}
      {claim.negotiation && <NegotiationTimeline negotiation={claim.negotiation} claimId={claimId} />}
    </div>
  );
}
