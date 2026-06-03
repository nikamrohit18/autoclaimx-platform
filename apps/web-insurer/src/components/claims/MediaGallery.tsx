'use client';

import { useEffect, useState } from 'react';
import { claimsApi } from '@/lib/api';

interface MediaAsset {
  id: string;
  mimeType: string;
  mediaType: string;
  processingStatus: string;
  sizeBytes: number;
  uploadedAt: string;
  viewUrl: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:    'bg-gray-100 text-gray-500',
  PROCESSING: 'bg-yellow-100 text-yellow-700',
  COMPLETE:   'bg-green-100 text-green-700',
  FAILED:     'bg-red-100 text-red-700',
};

function formatBytes(bytes: number) {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentIcon() {
  return (
    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function Lightbox({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl leading-none"
          aria-label="Close"
        >×</button>

        {asset.mediaType === 'IMAGE' && asset.viewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.viewUrl} alt="Claim media" className="max-w-full max-h-[85vh] object-contain rounded-lg mx-auto block" />
        ) : asset.mediaType === 'VIDEO' && asset.viewUrl ? (
          <video src={asset.viewUrl} controls className="max-w-full max-h-[85vh] rounded-lg mx-auto block" />
        ) : (
          <div className="bg-white rounded-lg p-8 text-center space-y-3">
            <DocumentIcon />
            <p className="text-sm text-gray-600">PDF document — {formatBytes(asset.sizeBytes)}</p>
            {asset.viewUrl && (
              <a href={asset.viewUrl} target="_blank" rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Open PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MediaGallery({ claimId }: { claimId: string }) {
  const [assets, setAssets]     = useState<MediaAsset[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lightbox, setLightbox] = useState<MediaAsset | null>(null);

  useEffect(() => {
    claimsApi.getMedia(claimId)
      .then(setAssets)
      .finally(() => setLoading(false));
  }, [claimId]);

  if (loading) return null;
  if (assets.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Media ({assets.length})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {assets.map((asset) => {
            const clickable = !!asset.viewUrl;
            return (
              <div
                key={asset.id}
                onClick={() => clickable && setLightbox(asset)}
                className={`relative rounded-lg border overflow-hidden bg-gray-50 aspect-square flex items-center justify-center group ${clickable ? 'cursor-pointer hover:border-blue-400 transition-colors' : ''}`}
              >
                {asset.mediaType === 'IMAGE' && asset.viewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.viewUrl}
                    alt="Claim photo"
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  />
                ) : asset.mediaType === 'VIDEO' ? (
                  <VideoIcon />
                ) : (
                  <DocumentIcon />
                )}

                {/* Status badge */}
                <span className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[asset.processingStatus] ?? STATUS_BADGE.PENDING}`}>
                  {asset.processingStatus}
                </span>

                {/* Size */}
                <span className="absolute bottom-1.5 left-1.5 text-[10px] text-gray-400 bg-white/80 rounded px-1">
                  {formatBytes(asset.sizeBytes)}
                </span>

                {/* Expand hint */}
                {clickable && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {assets.every((a) => a.viewUrl === null) && (
          <p className="text-xs text-gray-400">Thumbnails unavailable — AWS credentials not configured in dev.</p>
        )}
      </div>

      {lightbox && <Lightbox asset={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
