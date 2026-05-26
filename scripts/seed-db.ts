/**
 * Database seed script for local development.
 * Creates: 1 tenant, 1 insurer admin, 1 adjuster, 1 workshop, 1 workshop user, 3 sample claims.
 *
 * Run: pnpm db:seed
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding AutoClaimX database...');

  // ── Tenant ──────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-insurer' },
    update: {},
    create: {
      id: 'tenant-001',
      name: 'Demo Insurance Co.',
      slug: 'demo-insurer',
      plan: 'PROFESSIONAL',
      config: {
        negotiationStyle: 'BALANCED',
        maxNegotiationRounds: 3,
        autoApprovalThreshold: 500,
        fraudAutoHoldThreshold: 0.75,
        primaryCurrency: 'USD',
        allowedCurrencies: ['USD', 'THB'],
      },
    },
  });
  console.log(`✓ Tenant: ${tenant.name}`);

  // ── Users ───────────────────────────────────────────────────────────────────
  const adminHash = crypto.createHash('sha256').update('admin123').digest('hex');
  const adjusterHash = crypto.createHash('sha256').update('adjuster123').digest('hex');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo-insurer.com' },
    update: {},
    create: {
      id: 'user-admin-001',
      tenantId: tenant.id,
      email: 'admin@demo-insurer.com',
      name: 'Demo Admin',
      role: 'INSURER_ADMIN',
      passwordHash: adminHash,
    },
  });

  const adjuster = await prisma.user.upsert({
    where: { email: 'adjuster@demo-insurer.com' },
    update: {},
    create: {
      id: 'user-adj-001',
      tenantId: tenant.id,
      email: 'adjuster@demo-insurer.com',
      name: 'Jane Adjuster',
      role: 'ADJUSTER',
      passwordHash: adjusterHash,
    },
  });
  console.log(`✓ Users: ${admin.email}, ${adjuster.email}`);

  // ── Workshop ────────────────────────────────────────────────────────────────
  const workshop = await prisma.workshop.upsert({
    where: { id: 'workshop-001' },
    update: {},
    create: {
      id: 'workshop-001',
      tenantId: tenant.id,
      name: 'Premium Auto Repairs',
      email: 'workshop@premiumauto.com',
      phone: '+1-555-0100',
      address: '123 Repair St, Bangkok',
      accreditationStatus: 'APPROVED',
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@premiumauto.com' },
    update: {},
    create: {
      id: 'user-ws-001',
      tenantId: tenant.id,
      email: 'staff@premiumauto.com',
      name: 'Workshop Staff',
      role: 'WORKSHOP_STAFF',
      passwordHash: crypto.createHash('sha256').update('workshop123').digest('hex'),
    },
  });
  console.log(`✓ Workshop: ${workshop.name}`);

  // ── Claims ──────────────────────────────────────────────────────────────────
  const claimsData = [
    {
      id: 'claim-001',
      claimNumber: 'CLM-2026-001',
      status: 'UNDER_ASSESSMENT' as const,
      policyNumber: 'POL-001234',
      policyHolderId: 'ph-001',
      vehiclePlate: 'ABC-1234',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      incidentDate: new Date('2026-05-20'),
      incidentDescription: 'Rear-end collision in parking lot',
    },
    {
      id: 'claim-002',
      claimNumber: 'CLM-2026-002',
      status: 'NEGOTIATING' as const,
      policyNumber: 'POL-005678',
      policyHolderId: 'ph-002',
      vehiclePlate: 'XYZ-5678',
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
      vehicleYear: 2021,
      incidentDate: new Date('2026-05-22'),
      incidentDescription: 'Side swipe damage on left door',
    },
    {
      id: 'claim-003',
      claimNumber: 'CLM-2026-003',
      status: 'SETTLED' as const,
      policyNumber: 'POL-009012',
      policyHolderId: 'ph-003',
      vehiclePlate: 'DEF-9012',
      vehicleMake: 'BMW',
      vehicleModel: '3 Series',
      vehicleYear: 2023,
      incidentDate: new Date('2026-05-10'),
      incidentDescription: 'Front bumper damage from minor collision',
      settlementAmount: 2800,
      closedAt: new Date('2026-05-15'),
    },
  ];

  for (const c of claimsData) {
    await prisma.claim.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, tenantId: tenant.id, currency: 'USD' },
    });
  }
  console.log(`✓ Claims: ${claimsData.length} seeded`);

  // ── Fraud Score for claim-002 ────────────────────────────────────────────────
  await prisma.fraudScore.upsert({
    where: { claimId: 'claim-002' },
    update: {},
    create: {
      id: 'fraud-002',
      claimId: 'claim-002',
      totalScore: 0.15,
      imageScore: 0.1,
      behavioralScore: 0.2,
      graphScore: 0.0,
      riskLevel: 'LOW',
      flags: [],
    },
  });

  console.log('\n✅ Seed complete!');
  console.log('\nDemo credentials:');
  console.log('  Insurer Admin: admin@demo-insurer.com / admin123');
  console.log('  Adjuster:      adjuster@demo-insurer.com / adjuster123');
  console.log('  Workshop:      staff@premiumauto.com / workshop123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
