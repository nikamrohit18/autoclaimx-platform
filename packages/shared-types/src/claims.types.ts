// ─────────────────────────────────────────────────────────────────────────────
// Claims domain types — canonical definitions shared across all services
// and web apps. Matches Prisma schema 1:1.
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimStatus =
  | 'FNOL_RECEIVED'
  | 'MEDIA_PROCESSING'
  | 'UNDER_ASSESSMENT'
  | 'NEGOTIATING'
  | 'SETTLED'
  | 'CLOSED'
  | 'DISPUTED';

export type DamageSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'TOTAL_LOSS';

export type RepairRecommendation = 'REPAIR' | 'REPLACE' | 'MANUAL_REVIEW';

export type NegotiationStatus =
  | 'PENDING'
  | 'OFFER_SENT'
  | 'COUNTER_RECEIVED'
  | 'AGREED'
  | 'ESCALATED'
  | 'ABANDONED';

export type FraudRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'INSURER_ADMIN'
  | 'ADJUSTER'
  | 'WORKSHOP_ADMIN'
  | 'WORKSHOP_STAFF'
  | 'FLEET_ADMIN'
  | 'POLICYHOLDER';

// ─── Claim ───────────────────────────────────────────────────────────────────

export interface Claim {
  id: string;
  tenantId: string;
  claimNumber: string;
  status: ClaimStatus;
  policyNumber: string;
  policyHolderId: string;
  vehicleVin?: string;
  vehiclePlate: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  incidentDate: string; // ISO 8601
  incidentLocation?: GeoPoint;
  incidentDescription?: string;
  damageReport?: DamageReport;
  fraudScore?: FraudScore;
  negotiation?: Negotiation;
  currency: string;
  assignedAdjusterId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

// ─── Damage Detection ────────────────────────────────────────────────────────

export interface DamageReport {
  id: string;
  claimId: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  aiDamages: DetectedDamage[];
  overallSeverity: DamageSeverity;
  totalLossProbability: number; // 0–1
  estimatedCostMin: number;
  estimatedCostMax: number;
  currency: string;
  humanOverride?: Partial<DamageReport>;
  processedAt?: string;
  modelVersion: string;
}

export interface DetectedDamage {
  partLabel: string;
  damageClass: DamageClass;
  confidence: number; // 0–1
  severity: DamageSeverity;
  recommendation: RepairRecommendation;
  estimatedCostMin: number;
  estimatedCostMax: number;
  bbox?: BoundingBox;
  mediaAssetId: string;
}

export type DamageClass =
  | 'DENT'
  | 'SCRATCH'
  | 'CRACK'
  | 'BROKEN_GLASS'
  | 'DEPLOYMENT'
  | 'FLOOD_DAMAGE'
  | 'STRUCTURAL';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  claimId: string;
  tenantId: string;
  originalUrl: string;
  cdnUrl?: string;
  thumbnailUrl?: string;
  captureMetadata: CaptureMetadata;
  qualityFlags: QualityFlags;
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  annotations?: DetectedDamage[];
  createdAt: string;
}

export interface CaptureMetadata {
  lat?: number;
  lng?: number;
  timestamp?: string;
  deviceModel?: string;
  angleTag?: MediaAngleTag;
  exifTimestamp?: string;
}

export type MediaAngleTag =
  | 'FRONT'
  | 'REAR'
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'DAMAGE_CLOSE_UP'
  | 'INTERIOR'
  | 'ODOMETER'
  | 'OTHER';

export interface QualityFlags {
  blurScore: number; // higher = clearer
  exposureOk: boolean;
  faceDetected: boolean; // should not have faces for privacy
  passed: boolean;
}

// ─── Negotiation ─────────────────────────────────────────────────────────────

export interface Negotiation {
  id: string;
  claimId: string;
  workshopId: string;
  status: NegotiationStatus;
  currentRound: number;
  maxRounds: number;
  workshopEstimateId?: string;
  finalAmount?: number;
  currency: string;
  offers: NegotiationOffer[];
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationOffer {
  id: string;
  negotiationId: string;
  round: number;
  offerer: 'AI' | 'WORKSHOP';
  amount: number;
  currency: string;
  breakdown: LineItem[];
  message: string;
  confidence?: number;
  style?: NegotiationStyle;
  createdAt: string;
}

export interface LineItem {
  description: string;
  partNumber?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  laborHours?: number;
  aiRecommendation?: RepairRecommendation;
  benchmarkCostMin?: number;
  benchmarkCostMax?: number;
  flagged?: boolean;
  flagReason?: string;
}

export type NegotiationStyle = 'AGGRESSIVE' | 'BALANCED' | 'CUSTOMER_FIRST';

// ─── Workshop Estimate (from OCR) ────────────────────────────────────────────

export interface WorkshopEstimate {
  id: string;
  workshopId: string;
  claimId: string;
  rawFileUrl: string;
  lineItems: LineItem[];
  subtotal: number;
  laborTotal: number;
  partsTotal: number;
  total: number;
  currency: string;
  ocrConfidence: number;
  createdAt: string;
}

// ─── Fraud ───────────────────────────────────────────────────────────────────

export interface FraudScore {
  id: string;
  claimId: string;
  totalScore: number; // 0–1
  imageScore: number;
  behavioralScore: number;
  graphScore: number;
  riskLevel: FraudRisk;
  flags: FraudFlag[];
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FraudFlag {
  type: FraudFlagType;
  description: string;
  severity: FraudRisk;
  evidence?: Record<string, unknown>;
}

export type FraudFlagType =
  | 'IMAGE_FORGERY'
  | 'DUPLICATE_IMAGE'
  | 'EXIF_MISMATCH'
  | 'HIGH_CLAIM_VELOCITY'
  | 'POLICY_INCEPTION_PROXIMITY'
  | 'KNOWN_FRAUD_NETWORK'
  | 'SUSPICIOUS_WORKSHOP'
  | 'BEHAVIORAL_ANOMALY';

// ─── Tenant & User ───────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  config: TenantConfig;
  active: boolean;
  createdAt: string;
}

export type TenantPlan = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface TenantConfig {
  negotiationStyle: NegotiationStyle;
  maxNegotiationRounds: number;
  autoApprovalThreshold: number;
  fraudAutoHoldThreshold: number;
  allowedCurrencies: string[];
  primaryCurrency: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface User {
  id: string;
  tenantId: string;
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

// ─── Workshop ─────────────────────────────────────────────────────────────────

export interface Workshop {
  id: string;
  tenantId: string;
  name: string;
  registrationNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  location?: GeoPoint;
  accreditationStatus: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  riskScore: number; // 0–1 (higher = riskier)
  averageNegotiationDiscount: number; // historical average %
  active: boolean;
  createdAt: string;
}

// ─── API Responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Kafka Events ─────────────────────────────────────────────────────────────

export interface KafkaEvent<T = unknown> {
  eventId: string;
  eventType: string;
  tenantId: string;
  timestamp: string;
  payload: T;
}

export interface ClaimCreatedPayload {
  claimId: string;
  claimNumber: string;
  policyHolderId: string;
  vehiclePlate: string;
}

export interface MediaUploadedPayload {
  claimId: string;
  mediaAssetId: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  currency: string;
}

export interface DamageAnalyzedPayload {
  claimId: string;
  damageReportId: string;
  overallSeverity: DamageSeverity;
  totalLossProbability: number;
  estimatedCostMin: number;
  estimatedCostMax: number;
  currency: string;
}

export interface FraudScoreUpdatedPayload {
  claimId: string;
  fraudScoreId: string;
  totalScore: number;
  riskLevel: FraudRisk;
  autoHold: boolean;
  imageScore?: number; // set by fraud-ml; absent for behavioral-only events
  flags?: Array<{ type: string; description: string; severity: string }>;
}

export interface NegotiationOfferMadePayload {
  claimId: string;
  negotiationId: string;
  offerId: string;
  round: number;
  offerer: 'AI' | 'WORKSHOP';
  amount: number;
  currency: string;
  sessionStatus?: NegotiationStatus;
}
