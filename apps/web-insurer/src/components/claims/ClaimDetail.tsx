'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { claimsApi, negotiationsApi, workshopsApi } from '@/lib/api';
import { useClaimEvents } from '@/hooks/useClaimEvents';
import { DamageViewer } from '@/components/damage/DamageViewer';
import { FraudScoreCard } from '@/components/fraud/FraudScoreCard';
import { MediaGallery } from '@/components/claims/MediaGallery';
import { NegotiationTimeline } from '@/components/negotiation/NegotiationTimeline';
import type { Claim, Workshop } from '@autoclaimx/shared-types';

interface EstimateSummary {
  id: string;
  claimId: string;
  total: number;
  laborTotal: number;
  partsTotal: number;
  currency: string;
  createdAt: string;
}

interface ClaimDetailProps {
  claimId: string;
}

export function ClaimDetail({ claimId }: ClaimDetailProps) {
  const [claim, setClaim]                   = useState<Claim | null>(null);
  const [workshops, setWorkshops]           = useState<Workshop[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState('');
  const [estimates, setEstimates]           = useState<EstimateSummary[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState('');
  const [startingNeg, setStartingNeg]       = useState(false);
  const [loading, setLoading]               = useState(true);

  const loadClaim = useCallback(() => {
    claimsApi.get(claimId).then(setClaim).finally(() => setLoading(false));
  }, [claimId]);

  const wsConnected = useClaimEvents(claimId, (status) => {
    setClaim((prev) => prev ? { ...prev, status: status as Claim['status'] } : prev);
  });

  // Load estimates whenever the selected workshop changes
  useEffect(() => {
    if (!selectedWorkshopId) { setEstimates([]); setSelectedEstimateId(''); return; }
    workshopsApi.getEstimates(selectedWorkshopId).then((data) => {
      setEstimates(data);
      setSelectedEstimateId(data.length > 0 ? data[0].id : '');
    }).catch(() => { setEstimates([]); setSelectedEstimateId(''); });
  }, [selectedWorkshopId]);

  useEffect(() => {
    loadClaim();
    workshopsApi.list().then((data: Workshop[]) => {
      setWorkshops(data);
      if (data.length > 0) setSelectedWorkshopId(data[0].id);
    });
  }, [loadClaim]);

  async function handleStartNegotiation() {
    if (!selectedWorkshopId || !selectedEstimateId) return;
    setStartingNeg(true);
    try {
      await negotiationsApi.start({ claimId, workshopId: selectedWorkshopId, workshopEstimateId: selectedEstimateId });
      loadClaim();
    } finally {
      setStartingNeg(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Loading claim...</div>;
  if (!claim)  return <div className="text-center py-12 text-sm text-red-600">Claim not found</div>;

  const canStartNeg = claim.damageReport && !claim.negotiation && claim.status === 'UNDER_ASSESSMENT';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/claims" className="hover:text-blue-600 transition-colors">Claims</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-medium">{claim.claimNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{claim.claimNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear} · {claim.vehiclePlate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {wsConnected && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {claim.status.replace(/_/g, ' ')}
          </span>
          {claim.negotiation?.finalAmount != null && (
            <span className="text-sm text-gray-500">
              Settlement: <strong>{claim.negotiation.currency} {Number(claim.negotiation.finalAmount).toLocaleString()}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Claim Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Policy',        value: claim.policyNumber },
          { label: 'Incident Date', value: new Date(claim.incidentDate).toLocaleDateString() },
          { label: 'Policy Holder', value: claim.policyHolderName ?? claim.policyHolderId },
          { label: 'VIN',           value: claim.vehicleVin ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-lg border p-4">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className="text-sm font-medium text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Uploaded Media */}
      <MediaGallery claimId={claimId} />

      {/* AI Damage Report */}
      {claim.damageReport && <DamageViewer damageReport={claim.damageReport} />}

      {/* Fraud Score */}
      {claim.fraudScore && <FraudScoreCard fraudScore={claim.fraudScore} />}

      {/* Start Negotiation */}
      {canStartNeg && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Start AI Negotiation</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workshop</label>
              <select
                value={selectedWorkshopId}
                onChange={(e) => setSelectedWorkshopId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workshop Estimate</label>
              {estimates.length > 0 ? (
                <select
                  value={selectedEstimateId}
                  onChange={(e) => setSelectedEstimateId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {estimates.map((est) => (
                    <option key={est.id} value={est.id}>
                      {est.currency} {Number(est.total).toLocaleString()} — {new Date(est.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full border rounded-md px-3 py-2 text-sm text-gray-400 bg-gray-50">
                  {selectedWorkshopId ? 'No estimates on file for this workshop' : 'Select a workshop first'}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleStartNegotiation}
            disabled={startingNeg || !selectedWorkshopId || !selectedEstimateId}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {startingNeg ? 'Starting...' : 'Start AI Negotiation'}
          </button>
        </div>
      )}

      {/* Negotiation Timeline */}
      {claim.negotiation && (
        <NegotiationTimeline negotiation={claim.negotiation} onRefresh={loadClaim} />
      )}
    </div>
  );
}
