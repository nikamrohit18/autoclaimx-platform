'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getStoredUser, clearSession, isAdmin, StoredUser } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('acx_access_token');
    if (!token) { router.replace('/login'); return; }
    setUser(getStoredUser());
  }, [router]);

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  const navItems = [
    { href: '/claims', label: 'Claims' },
    { href: '/workshops', label: 'Workshops' },
    { href: '/analytics', label: 'Analytics' },
    ...(isAdmin(user) ? [{ href: '/admin/users', label: 'Admin' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-lg font-bold text-gray-900">AutoClaimX</span>
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-gray-500">
              {user.name} · <span className="text-xs text-gray-400">{user.role}</span>
            </span>
          )}
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
