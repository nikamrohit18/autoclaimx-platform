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

  getMedia: (claimId: string) =>
    api.get(`/claims/${claimId}/media`).then((r) => r.data as Array<{
      id: string; mimeType: string; mediaType: string;
      processingStatus: string; sizeBytes: number;
      uploadedAt: string; viewUrl: string | null;
    }>),
};

// ── Negotiations ──────────────────────────────────────────────────────────────

export const negotiationsApi = {
  start: (body: { claimId: string; workshopId: string; workshopEstimateId: string }) =>
    api.post('/negotiations', body).then((r) => r.data),

  getByClaimId: (claimId: string) => api.get(`/negotiations/claim/${claimId}`).then((r) => r.data),

  counter: (sessionId: string, body: { amount: number; message: string }) =>
    api.post(`/negotiations/${sessionId}/counter`, body).then((r) => r.data),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminApi = {
  listUsers: () => api.get('/users').then((r) => r.data),

  createUser: (body: {
    name: string; email?: string; phone?: string;
    role: string; password?: string; workshopId?: string;
  }) => api.post('/users', body).then((r) => r.data),

  updateUser: (id: string, body: { name?: string; role?: string; active?: boolean }) =>
    api.patch(`/users/${id}`, body).then((r) => r.data),

  getTenant: () => api.get('/tenants/me').then((r) => r.data),

  updateTenant: (id: string, body: Record<string, unknown>) =>
    api.patch(`/tenants/${id}`, body).then((r) => r.data),
};

// ── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  get: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/claims/analytics', { params }).then((r) => r.data),
};

// ── Workshops ─────────────────────────────────────────────────────────────────

export const workshopsApi = {
  list: () => api.get('/workshops').then((r) => r.data),

  get: (id: string) => api.get(`/workshops/${id}`).then((r) => r.data),

  getEstimates: (workshopId: string) =>
    api.get(`/workshops/${workshopId}/estimates`).then((r) => r.data as Array<{
      id: string; claimId: string; total: number; laborTotal: number;
      partsTotal: number; currency: string; createdAt: string;
    }>),
};
