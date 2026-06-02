'use client';

import type { FraudScore, FraudFlag } from '@autoclaimx/shared-types';

const RISK_STYLES = {
  LOW: { bar: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  MEDIUM: { bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700' },
  HIGH: { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  CRITICAL: { bar: 'bg-red-700', badge: 'bg-red-200 text-red-800' },
};

interface FraudScoreCardProps {
  fraudScore: FraudScore;
}

function scoreBarColor(pct: number): string {
  if (pct >= 75) return 'bg-red-500';
  if (pct >= 50) return 'bg-yellow-500';
  if (pct >= 25) return 'bg-orange-400';
  return 'bg-green-500';
}

export function FraudScoreCard({ fraudScore }: FraudScoreCardProps) {
  const style = RISK_STYLES[fraudScore.riskLevel];
  const totalPct = Math.round(Number(fraudScore.totalScore) * 100);

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fraud Intelligence</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${style.badge}`}>
          {fraudScore.riskLevel} RISK
        </span>
      </div>

      {/* Score breakdown */}
      <div className="space-y-3">
        {[
          { label: 'Overall Score', value: totalPct },
          { label: 'Image Analysis', value: Math.round(Number(fraudScore.imageScore) * 100) },
          { label: 'Behavioral', value: Math.round(Number(fraudScore.behavioralScore) * 100) },
          { label: 'Network Graph', value: Math.round(Number(fraudScore.graphScore) * 100) },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-36 flex-shrink-0">{label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${scoreBarColor(value)} transition-all`}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 w-10 text-right">{value}%</span>
          </div>
        ))}
      </div>

      {/* Flags */}
      {fraudScore.flags && fraudScore.flags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Fraud Signals</h3>
          {(fraudScore.flags as FraudFlag[]).map((flag, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-red-500">⚠</span>
              <div>
                <span className="font-medium text-gray-800">{flag.type.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-gray-600">{flag.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
