import 'reflect-metadata';
import { WorkflowService } from './workflow.service';
import { KafkaService } from '../kafka/kafka.service';
import { ClaimsService } from '../claims/claims.service';
import { FraudService } from '../fraud/fraud.service';
import { NotificationService } from '../notifications/notification.service';
import { Counter } from 'prom-client';

// ── Kafka subscribe captures callbacks by topic ────────────────────────────────
const topicCallbacks = new Map<string, (event: Record<string, unknown>) => Promise<void>>();

const mockKafka = {
  subscribe: jest.fn().mockImplementation(
    (topic: string, _group: string, cb: (e: Record<string, unknown>) => Promise<void>) => {
      topicCallbacks.set(topic, cb);
      return Promise.resolve();
    },
  ),
  publish: jest.fn().mockResolvedValue(undefined),
} as unknown as KafkaService;

const mockClaims = {
  updateStatus: jest.fn().mockResolvedValue({}),
  applyDamageAnalyzed: jest.fn().mockResolvedValue(undefined),
} as unknown as ClaimsService;

const mockFraud = {
  scoreBehavioral: jest.fn().mockResolvedValue(undefined),
  applyImageScore: jest.fn().mockResolvedValue(undefined),
} as unknown as FraudService;

const mockKafkaCounter = { inc: jest.fn() } as unknown as Counter<string>;

const mockNotifications = {
  notifyClaimCreated:       jest.fn().mockResolvedValue(undefined),
  notifyStatusChanged:      jest.fn().mockResolvedValue(undefined),
  notifyNegotiationOutcome: jest.fn().mockResolvedValue(undefined),
} as unknown as NotificationService;

// ── Helpers ────────────────────────────────────────────────────────────────────
function emit(topic: string, tenantId: string, payload: Record<string, unknown>) {
  const cb = topicCallbacks.get(topic);
  if (!cb) throw new Error(`No subscriber registered for topic: ${topic}`);
  return cb({ tenantId, payload });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeAll(async () => {
    service = new WorkflowService(mockKafka, mockClaims, mockFraud, mockNotifications, mockKafkaCounter);
    await service.onModuleInit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (mockKafka.publish as jest.Mock).mockResolvedValue(undefined);
    (mockClaims.updateStatus as jest.Mock).mockResolvedValue({});
    (mockClaims.applyDamageAnalyzed as jest.Mock).mockResolvedValue(undefined);
    (mockFraud.scoreBehavioral as jest.Mock).mockResolvedValue(undefined);
    (mockFraud.applyImageScore as jest.Mock).mockResolvedValue(undefined);
    mockKafkaCounter.inc = jest.fn();
  });

  // ── claim.created ────────────────────────────────────────────────────────────
  describe('claim.created consumer', () => {
    it('triggers behavioral fraud scoring on claim creation', async () => {
      await emit('claim.created', 't1', { claimId: 'c1', policyHolderId: 'ph1', vehiclePlate: 'ABC' });
      expect(mockFraud.scoreBehavioral).toHaveBeenCalledWith('t1', 'c1', 'ph1', 'ABC');
    });
  });

  // ── damage.analyzed ──────────────────────────────────────────────────────────
  describe('damage.analyzed consumer', () => {
    it('delegates to ClaimsService.applyDamageAnalyzed', async () => {
      const payload = { claimId: 'c1', overallSeverity: 'MODERATE', estimatedCostMin: 500, estimatedCostMax: 1500, totalLossProbability: 0.1, currency: 'MYR' };
      await emit('damage.analyzed', 't1', payload);
      expect(mockClaims.applyDamageAnalyzed).toHaveBeenCalledWith('t1', payload);
    });
  });

  // ── fraud.score.updated ──────────────────────────────────────────────────────
  describe('fraud.score.updated consumer', () => {
    it('calls applyImageScore when imageScore is present', async () => {
      const flags = [{ type: 'IMAGE_FORGERY', description: 'ELA', severity: 'HIGH' }];
      await emit('fraud.score.updated', 't1', { claimId: 'c1', riskLevel: 'HIGH', autoHold: false, imageScore: 0.9, flags });
      expect(mockFraud.applyImageScore).toHaveBeenCalledWith('t1', 'c1', 0.9, flags);
    });

    it('does NOT call applyImageScore when imageScore is absent', async () => {
      await emit('fraud.score.updated', 't1', { claimId: 'c1', riskLevel: 'LOW', autoHold: false });
      expect(mockFraud.applyImageScore).not.toHaveBeenCalled();
    });

    it('auto-holds the claim (→ DISPUTED) when autoHold=true', async () => {
      await emit('fraud.score.updated', 't1', { claimId: 'c1', riskLevel: 'HIGH', autoHold: true });
      expect(mockClaims.updateStatus).toHaveBeenCalledWith('t1', 'c1', 'DISPUTED');
    });

    it('does NOT auto-hold when autoHold=false', async () => {
      await emit('fraud.score.updated', 't1', { claimId: 'c1', riskLevel: 'LOW', autoHold: false });
      expect(mockClaims.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ── negotiation.offer.made ───────────────────────────────────────────────────
  describe('negotiation.offer.made consumer', () => {
    it('transitions claim → NEGOTIATING on round=1 AI offer', async () => {
      await emit('negotiation.offer.made', 't1', { claimId: 'c1', round: 1, offerer: 'AI', sessionStatus: 'OFFER_SENT' });
      expect(mockClaims.updateStatus).toHaveBeenCalledWith('t1', 'c1', 'NEGOTIATING', 'UNDER_ASSESSMENT');
    });

    it('does NOT transition to NEGOTIATING for round > 1', async () => {
      await emit('negotiation.offer.made', 't1', { claimId: 'c1', round: 2, offerer: 'AI', sessionStatus: 'OFFER_SENT' });
      expect(mockClaims.updateStatus).not.toHaveBeenCalledWith('t1', 'c1', 'NEGOTIATING', 'UNDER_ASSESSMENT');
    });

    it('transitions claim → SETTLED when sessionStatus=AGREED', async () => {
      await emit('negotiation.offer.made', 't1', { claimId: 'c1', round: 2, offerer: 'AI', sessionStatus: 'AGREED' });
      expect(mockClaims.updateStatus).toHaveBeenCalledWith('t1', 'c1', 'SETTLED', 'NEGOTIATING');
    });

    it('transitions claim → DISPUTED when sessionStatus=ESCALATED', async () => {
      await emit('negotiation.offer.made', 't1', { claimId: 'c1', round: 3, offerer: 'AI', sessionStatus: 'ESCALATED' });
      expect(mockClaims.updateStatus).toHaveBeenCalledWith('t1', 'c1', 'DISPUTED', 'NEGOTIATING');
    });
  });
});
