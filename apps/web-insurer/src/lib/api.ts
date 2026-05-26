import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: `${API_URL}/api/v1` });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('acx_access_token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('acx_access_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Claims ────────────────────────────────────────────────────────────────────

export const claimsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/claims', { params }).then((r) => r.data),

  get: (id: string) => api.get(`/claims/${id}`).then((r) => r.data),

  create: (data: Record<string, unknown>) => api.post('/claims', data).then((r) => r.data),

  getUploadUrl: (claimId: string, body: { contentType: string; angleTag: string; fileName: string }) =>
    api.post(`/claims/${claimId}/media/upload-url`, body).then((r) => r.data),

  getDamageReport: (claimId: string) => api.get(`/claims/${claimId}/damage-report`).then((r) => r.data),

  getFraudScore: (claimId: string) => api.get(`/claims/${claimId}/fraud-score`).then((r) => r.data),

  startNegotiation: (claimId: string, body: { workshopId: string; workshopEstimateId: string }) =>
    api.post(`/claims/${claimId}/negotiation`, body).then((r) => r.data),

  getNegotiation: (claimId: string) => api.get(`/claims/${claimId}/negotiation`).then((r) => r.data),
};
