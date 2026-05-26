import type { Metadata } from 'next';
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { NewClaimButton } from '@/components/claims/NewClaimButton';

export const metadata: Metadata = { title: 'Claims — AutoClaimX' };

export default function ClaimsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Claims</h1>
          <p className="mt-1 text-sm text-gray-500">Manage and track all insurance claims</p>
        </div>
        <NewClaimButton />
      </div>
      <ClaimsTable />
    </div>
  );
}
