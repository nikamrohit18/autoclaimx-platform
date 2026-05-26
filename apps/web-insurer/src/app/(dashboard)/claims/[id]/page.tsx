import type { Metadata } from 'next';
import { ClaimDetail } from '@/components/claims/ClaimDetail';

export const metadata: Metadata = { title: 'Claim Detail — AutoClaimX' };

interface PageProps {
  params: { id: string };
}

export default function ClaimDetailPage({ params }: PageProps) {
  return <ClaimDetail claimId={params.id} />;
}
