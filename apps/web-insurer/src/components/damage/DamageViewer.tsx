'use client';

import type { DamageReport, DetectedDamage } from '@autoclaimx/shared-types';

const SEVERITY_COLORS = {
  LOW: 'text-green-600 bg-green-50',
  MEDIUM: 'text-yellow-600 bg-yellow-50',
  HIGH: 'text-red-600 bg-red-50',
  TOTAL_LOSS: 'text-red-800 bg-red-100',
};

interface DamageViewerProps {
  damageReport: DamageReport;
}

export function DamageViewer({ damageReport }: DamageViewerProps) {
  if (damageReport.processingStatus === 'PENDING' || damageReport.processingStatus === 'PROCESSING') {
    return (
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">AI Damage Assessment</h2>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          Processing damage detection...
        </div>
      </div>
    );
  }

  const damages = damageReport.aiDamages ?? [];

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Damage Assessment</h2>
        <div className="flex items-center gap-3">
          {damageReport.overallSeverity && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${SEVERITY_COLORS[damageReport.overallSeverity]}`}>
              {damageReport.overallSeverity}
            </span>
          )}
          <span className="text-sm text-gray-500">
            Est. cost: <strong>
              {damageReport.currency} {Number(damageReport.estimatedCostMin).toLocaleString()} – {Number(damageReport.estimatedCostMax).toLocaleString()}
            </strong>
          </span>
        </div>
      </div>

      {damageReport.totalLossProbability > 0.5 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          Total loss probability: {(Number(damageReport.totalLossProbability) * 100).toFixed(0)}% — manual review recommended
        </div>
      )}

      {damages.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                {['Part', 'Damage Type', 'Severity', 'Recommendation', 'Cost Range', 'Confidence'].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-gray-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {damages.map((d: DetectedDamage, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4 font-medium text-gray-900">{d.partLabel}</td>
                  <td className="py-2 pr-4 text-gray-600">{d.damageClass?.replace(/_/g, ' ') ?? ''}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[d.severity] ?? 'text-gray-600 bg-gray-50'}`}>
                      {d.severity ?? '—'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{d.recommendation}</td>
                  <td className="py-2 pr-4 text-gray-600">
                    {(d.estimatedCostMin ?? 0).toLocaleString()} – {(d.estimatedCostMax ?? 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-gray-500">{((d.confidence ?? 0) * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400">No damages detected by AI model.</p>
      )}

      <div className="text-xs text-gray-400">Model: {damageReport.modelVersion}</div>
    </div>
  );
}
