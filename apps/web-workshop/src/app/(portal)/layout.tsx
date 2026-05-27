'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('acx_ws_token');
    if (!token) router.replace('/login');
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('acx_ws_token');
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-lg font-bold text-gray-900">AutoClaimX</span>
          <Link
            href="/negotiation"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            Negotiations
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Workshop Portal</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
