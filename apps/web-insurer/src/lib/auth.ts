export interface StoredUser {
  id: string;
  name: string;
  email?: string;
  role: string;
  tenantId: string;
  workshopId?: string;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('acx_user');
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('acx_access_token');
  localStorage.removeItem('acx_refresh_token');
  localStorage.removeItem('acx_user');
}

export function isAdmin(user: StoredUser | null): boolean {
  return user?.role === 'INSURER_ADMIN' || user?.role === 'PLATFORM_ADMIN';
}
