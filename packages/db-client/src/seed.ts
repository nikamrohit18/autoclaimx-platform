import { PrismaClient, ClaimStatus, TenantPlan, UserRole, AccreditationStatus, NegotiationStyle } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');

  const passwordHash = await bcrypt.hash('Demo@1234', 10);

  // ── Tenant ──────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'stellar-insurance' },
    update: {},
    create: {
      name: 'Stellar Insurance',
      slug: 'stellar-insurance',
      plan: TenantPlan.PROFESSIONAL,
      config: {
        negotiationStyle: NegotiationStyle.BALANCED,
        maxNegotiationRounds: 3,
        autoApprovalThreshold: 5000,
        fraudAutoHoldThreshold: 0.75,
        primaryCurrency: 'MYR',
      },
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // ── Workshop ─────────────────────────────────────────────────────────────────
  const workshop = await prisma.workshop.upsert({
    where: { id: 'seed-workshop-001' },
    update: {},
    create: {
      id: 'seed-workshop-001',
      tenantId: tenant.id,
      name: 'Prestige Auto Workshop',
      registrationNumber: 'WS-2024-001',
      phone: '+60312345678',
      email: 'service@prestigeauto.my',
      address: '12 Jalan Teknologi, Petaling Jaya, Selangor',
      lat: 3.1209,
      lng: 101.6559,
      accreditationStatus: AccreditationStatus.APPROVED,
      riskScore: 0.12,
      averageNegotiationDiscount: 0.08,
    },
  });
  console.log(`Workshop: ${workshop.name} (${workshop.id})`);

  // ── Users ────────────────────────────────────────────────────────────────────
  const insurerAdmin = await prisma.user.upsert({
    where: { email: 'admin@stellar.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@stellar.com',
      passwordHash,
      name: 'Sarah Abdullah',
      role: UserRole.INSURER_ADMIN,
    },
  });

  const adjuster = await prisma.user.upsert({
    where: { email: 'adjuster@stellar.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'adjuster@stellar.com',
      passwordHash,
      name: 'James Tan',
      role: UserRole.ADJUSTER,
    },
  });

  const workshopAdmin = await prisma.user.upsert({
    where: { email: 'wsadmin@stellar.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'wsadmin@stellar.com',
      passwordHash,
      name: 'Ali Hassan',
      role: UserRole.WORKSHOP_ADMIN,
      workshopId: workshop.id,
    },
  });

  const ph1 = await prisma.user.upsert({
    where: { phone: '+60123456789' },
    update: {},
    create: {
      tenantId: tenant.id,
      phone: '+60123456789',
      name: 'Ahmad Farid',
      role: UserRole.POLICYHOLDER,
    },
  });

  const ph2 = await prisma.user.upsert({
    where: { phone: '+60198765432' },
    update: {},
    create: {
      tenantId: tenant.id,
      phone: '+60198765432',
      name: 'Siti Noraini',
      role: UserRole.POLICYHOLDER,
    },
  });

  const ph3 = await prisma.user.upsert({
    where: { phone: '+60111234567' },
    update: {},
    create: {
      tenantId: tenant.id,
      phone: '+60111234567',
      name: 'Kumar Rajan',
      role: UserRole.POLICYHOLDER,
    },
  });

  console.log(`Users: ${insurerAdmin.name}, ${adjuster.name}, ${workshopAdmin.name}, ${ph1.name}, ${ph2.name}, ${ph3.name}`);

  // ── Claims ───────────────────────────────────────────────────────────────────

  // Claim 1 — Under Assessment
  const claim1 = await prisma.claim.upsert({
    where: { claimNumber: 'ACX-2024-00001' },
    update: {},
    create: {
      tenantId: tenant.id,
      claimNumber: 'ACX-2024-00001',
      status: ClaimStatus.UNDER_ASSESSMENT,
      policyNumber: 'POL-2024-88001',
      policyHolderId: ph1.id,
      vehiclePlate: 'WXY 1234',
      vehicleMake: 'Perodua',
      vehicleModel: 'Myvi',
      vehicleYear: 2021,
      vehicleVin: 'MBLKE52Y0M5001234',
      incidentDate: new Date('2024-11-15'),
      incidentAddress: 'Federal Highway, Petaling Jaya',
      incidentDescription: 'Rear-end collision at traffic light. Bumper and boot damaged.',
      assignedAdjusterId: adjuster.id,
      reserveAmount: 8500,
      currency: 'MYR',
    },
  });

  await prisma.damageReport.upsert({
    where: { claimId: claim1.id },
    update: {},
    create: {
      tenantId: tenant.id,
      claimId: claim1.id,
      processingStatus: 'COMPLETE',
      aiDamages: [
        { partLabel: 'Rear Bumper', damageClass: 'DENT', severity: 'HIGH', confidence: 0.94, recommendation: 'REPLACE', estimatedCostMin: 1800, estimatedCostMax: 2800, mediaAssetId: 'seed-media-001' },
        { partLabel: 'Boot Lid', damageClass: 'DENT', severity: 'MEDIUM', confidence: 0.87, recommendation: 'REPAIR', estimatedCostMin: 1400, estimatedCostMax: 3000, mediaAssetId: 'seed-media-001' },
      ],
      overallSeverity: 'MEDIUM',
      totalLossProbability: 0.05,
      estimatedCostMin: 3200,
      estimatedCostMax: 5800,
      currency: 'MYR',
      modelVersion: 'yolov8-acx-v1.2',
      processedAt: new Date(),
    },
  });

  // Claim 2 — Negotiating
  const claim2 = await prisma.claim.upsert({
    where: { claimNumber: 'ACX-2024-00002' },
    update: {},
    create: {
      tenantId: tenant.id,
      claimNumber: 'ACX-2024-00002',
      status: ClaimStatus.NEGOTIATING,
      policyNumber: 'POL-2024-88002',
      policyHolderId: ph2.id,
      vehiclePlate: 'VDF 5678',
      vehicleMake: 'Honda',
      vehicleModel: 'City',
      vehicleYear: 2022,
      incidentDate: new Date('2024-11-20'),
      incidentAddress: 'NKVE, Shah Alam',
      incidentDescription: 'Side swipe on highway. Front door and fender damaged.',
      assignedAdjusterId: adjuster.id,
      reserveAmount: 12000,
      currency: 'MYR',
    },
  });

  await prisma.damageReport.upsert({
    where: { claimId: claim2.id },
    update: {},
    create: {
      tenantId: tenant.id,
      claimId: claim2.id,
      processingStatus: 'COMPLETE',
      aiDamages: [
        { partLabel: 'Front Door (Left)', damageClass: 'DENT', severity: 'HIGH', confidence: 0.91, recommendation: 'REPLACE', estimatedCostMin: 3200, estimatedCostMax: 4200, mediaAssetId: 'seed-media-002' },
        { partLabel: 'Front Fender (Left)', damageClass: 'SCRATCH', severity: 'HIGH', confidence: 0.88, recommendation: 'REPAIR', estimatedCostMin: 1800, estimatedCostMax: 2600, mediaAssetId: 'seed-media-002' },
        { partLabel: 'Side Mirror (Left)', damageClass: 'CRACK', severity: 'MEDIUM', confidence: 0.95, recommendation: 'REPLACE', estimatedCostMin: 500, estimatedCostMax: 800, mediaAssetId: 'seed-media-002' },
      ],
      overallSeverity: 'HIGH',
      totalLossProbability: 0.1,
      estimatedCostMin: 7500,
      estimatedCostMax: 11000,
      currency: 'MYR',
      modelVersion: 'yolov8-acx-v1.2',
      processedAt: new Date(),
    },
  });

  const estimate2 = await prisma.workshopEstimate.upsert({
    where: { id: 'seed-estimate-002' },
    update: {},
    create: {
      id: 'seed-estimate-002',
      tenantId: tenant.id,
      workshopId: workshop.id,
      claimId: claim2.id,
      rawFileUrl: 'https://s3.example.com/estimates/acx-2024-00002.pdf',
      lineItems: [
        { description: 'Front door panel replacement', quantity: 1, unitCost: 3800, totalCost: 3800 },
        { description: 'Front fender repair & respray', quantity: 1, unitCost: 2200, totalCost: 2200 },
        { description: 'Side mirror assembly', quantity: 1, unitCost: 650, totalCost: 650 },
        { description: 'Labour (8 hrs)', quantity: 8, unitCost: 120, totalCost: 960 },
      ],
      subtotal: 7610,
      partsTotal: 6650,
      laborTotal: 960,
      total: 7610,
      currency: 'MYR',
      ocrConfidence: 0.92,
    },
  });

  const session2 = await prisma.negotiationSession.upsert({
    where: { claimId: claim2.id },
    update: {},
    create: {
      tenantId: tenant.id,
      claimId: claim2.id,
      workshopId: workshop.id,
      workshopEstimateId: estimate2.id,
      status: 'OFFER_SENT',
      currentRound: 1,
      maxRounds: 3,
      style: NegotiationStyle.BALANCED,
      currency: 'MYR',
    },
  });

  await prisma.negotiationOffer.create({
    data: {
      sessionId: session2.id,
      round: 1,
      offerer: 'AI',
      amount: 6800,
      currency: 'MYR',
      breakdown: [
        { description: 'Front door panel replacement', approved: 3400, workshopAsked: 3800, delta: -400 },
        { description: 'Front fender repair & respray', approved: 1900, workshopAsked: 2200, delta: -300 },
        { description: 'Side mirror assembly', approved: 600, workshopAsked: 650, delta: -50 },
        { description: 'Labour', approved: 900, workshopAsked: 960, delta: -60 },
      ],
      message: 'Based on benchmark rates for this repair type and vehicle age, we offer MYR 6,800. Parts pricing is adjusted to market average; labour rate capped at prevailing workshop tier.',
      confidence: 0.87,
      style: NegotiationStyle.BALANCED,
    },
  });

  // Claim 3 — Settled
  const claim3 = await prisma.claim.upsert({
    where: { claimNumber: 'ACX-2024-00003' },
    update: {},
    create: {
      tenantId: tenant.id,
      claimNumber: 'ACX-2024-00003',
      status: ClaimStatus.SETTLED,
      policyNumber: 'POL-2024-88003',
      policyHolderId: ph3.id,
      vehiclePlate: 'BCD 9012',
      vehicleMake: 'Toyota',
      vehicleModel: 'Vios',
      vehicleYear: 2020,
      incidentDate: new Date('2024-11-05'),
      incidentAddress: 'Jalan Ipoh, Kuala Lumpur',
      incidentDescription: 'Parking lot collision. Scratches and minor dent on front bumper.',
      assignedAdjusterId: adjuster.id,
      reserveAmount: 3000,
      settlementAmount: 2200,
      currency: 'MYR',
      closedAt: new Date('2024-11-18'),
    },
  });

  await prisma.damageReport.upsert({
    where: { claimId: claim3.id },
    update: {},
    create: {
      tenantId: tenant.id,
      claimId: claim3.id,
      processingStatus: 'COMPLETE',
      aiDamages: [
        { partLabel: 'Front Bumper', damageClass: 'SCRATCH', severity: 'LOW', confidence: 0.96, recommendation: 'REPAIR', estimatedCostMin: 800, estimatedCostMax: 2500, mediaAssetId: 'seed-media-003' },
      ],
      overallSeverity: 'LOW',
      totalLossProbability: 0.01,
      estimatedCostMin: 800,
      estimatedCostMax: 2500,
      currency: 'MYR',
      modelVersion: 'yolov8-acx-v1.2',
      processedAt: new Date(),
    },
  });

  console.log(`Claims: ${claim1.claimNumber} (${claim1.status}), ${claim2.claimNumber} (${claim2.status}), ${claim3.claimNumber} (${claim3.status})`);
  console.log('\nSeed complete. Demo credentials (password: Demo@1234):');
  console.log('  admin@stellar.com     → INSURER_ADMIN');
  console.log('  adjuster@stellar.com  → ADJUSTER');
  console.log('  wsadmin@stellar.com   → WORKSHOP_ADMIN');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
