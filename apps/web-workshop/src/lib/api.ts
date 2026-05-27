import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: `${API_URL}/api/v1` });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('acx_ws_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('acx_ws_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string, tenantSlug: string) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message ?? 'Login failed');
  }
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

// ── Workshops ─────────────────────────────────────────────────────────────────

export const workshopsApi = {
  list: () => api.get('/workshops').then((r) => r.data as WorkshopSummary[]),
};

export interface WorkshopSummary {
  id: string;
  name: string;
}

// ── Negotiations ──────────────────────────────────────────────────────────────

export interface NegotiationOffer {
  id: string;
  round: number;
  offerer: 'AI' | 'WORKSHOP';
  amount: number;
  currency: string;
  message: string;
  createdAt: string;
}

export interface NegotiationSession {
  id: string;
  claimId: string;
  status: string;
  currentRound: number;
  maxRounds: number;
  finalAmount?: number;
  currency: string;
  offers: NegotiationOffer[];
}

export const negotiationsApi = {
  getByWorkshop: (workshopId: string) =>
    api.get(`/negotiations/workshop/${workshopId}`).then((r) => r.data as NegotiationSession[]),

  counter: (sessionId: string, body: { amount: number; message: string }) =>
    api.post(`/negotiations/${sessionId}/counter`, body).then((r) => r.data),
};
