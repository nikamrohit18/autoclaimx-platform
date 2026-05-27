'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useClaimEvents(claimId: string, onStatusChange: (status: string) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_CLAIMS_SERVICE_URL ?? 'http://localhost:3001';
    const socket: Socket = io(url, { transports: ['websocket'] });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-claim', { claimId });
    });

    socket.on('status-changed', (data: { claimId: string; status: string }) => {
      if (data.claimId === claimId) onStatusChange(data.status);
    });

    socket.on('disconnect', () => setConnected(false));

    return () => { socket.disconnect(); };
  }, [claimId, onStatusChange]);

  return connected;
}
