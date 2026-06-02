import 'reflect-metadata';
import { FraudService } from './fraud.service';
import { KafkaService } from '../kafka/kafka.service';

// ── DB mock ────────────────────────────────────────────────────────────────────
const mockTx = {
  claim: { count: jest.fn() },
  fraudScore: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
  },
};

jest.mock('@autoclaimx/db-client', () => ({
  withTenant: jest.fn((_tenantId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
}));

// ── Dep mocks ──────────────────────────────────────────────────────────────────
const mockKafka = {
  publish: jest.fn().mockResolvedValue(undefined),
} as unknown as KafkaService;

// ── Helpers ────────────────────────────────────────────────────────────────────
function getUpsertCreate() {
  return mockTx.fraudScore.upsert.mock.calls[0][0].create as Record<string, unknown>;
}

function getKafkaPayload() {
  return (mockKafka.publish as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('FraudService', () => {
  let service: FraudService;

  beforeEach(() => {
    service = new FraudService(mockKafka);
    jest.clearAllMocks();
    mockTx.fraudScore.upsert.mockResolvedValue({});
    (mockKafka.publish as jest.Mock).mockResolvedValue(undefined);
  });

  // ── scoreBehavioral ──────────────────────────────────────────────────────────
  describe('scoreBehavioral', () => {
    it('scores 0 with no prior claims and sets riskLevel LOW', async () => {
      mockTx.claim.count.mockResolvedValue(0);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().behavioralScore).toBe(0);
      expect(getUpsertCreate().riskLevel).toBe('LOW');
    });

    it('scores 0.2 with 1 prior claim (moderate velocity)', async () => {
      mockTx.claim.count.mockResolvedValue(1);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().behavioralScore).toBe(0.2);
    });

    it('scores 0.2 with 2 prior claims (still moderate)', async () => {
      mockTx.claim.count.mockResolvedValue(2);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().behavioralScore).toBe(0.2);
    });

    it('scores 0.6 and raises HIGH_CLAIM_VELOCITY flag at 3 claims', async () => {
      mockTx.claim.count.mockResolvedValue(3);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().behavioralScore).toBeCloseTo(0.6, 5);
      expect((getUpsertCreate().flags as Array<{ type: string }>)[0].type).toBe('HIGH_CLAIM_VELOCITY');
    });

    it('caps behavioral score at 0.8 regardless of velocity', async () => {
      mockTx.claim.count.mockResolvedValue(20);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().behavioralScore).toBeLessThanOrEqual(0.8);
    });

    it('sets autoHold=true in Kafka payload when score >= 0.75', async () => {
      // 4 claims × 0.2 = 0.8 → above autoHold threshold 0.75
      mockTx.claim.count.mockResolvedValue(4);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getKafkaPayload().autoHold).toBe(true);
    });

    it('sets autoHold=false when score is below 0.75', async () => {
      mockTx.claim.count.mockResolvedValue(0);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getKafkaPayload().autoHold).toBe(false);
    });

    it('publishes exactly one fraud.score.updated Kafka event', async () => {
      mockTx.claim.count.mockResolvedValue(0);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(mockKafka.publish).toHaveBeenCalledTimes(1);
    });

    it('stores totalScore as behavioralScore × 0.35', async () => {
      mockTx.claim.count.mockResolvedValue(0);
      await service.scoreBehavioral('t1', 'c1', 'ph1', 'ABC123');
      expect(getUpsertCreate().totalScore).toBeCloseTo(0 * 0.35, 5);
    });
  });

  // ── applyImageScore ──────────────────────────────────────────────────────────
  describe('applyImageScore', () => {
    it('merges image score with existing behavioral score using correct weights', async () => {
      // behavioral=0.4 (weight 35%) + image=0.8 (weight 65%) = 0.14 + 0.52 = 0.66
      mockTx.fraudScore.findUnique.mockResolvedValue({ behavioralScore: 0.4, flags: [] });
      await service.applyImageScore('t1', 'c1', 0.8, []);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.totalScore).toBeCloseTo(0.66, 2);
    });

    it('marks riskLevel HIGH when merged totalScore >= 0.6', async () => {
      mockTx.fraudScore.findUnique.mockResolvedValue({ behavioralScore: 0.4, flags: [] });
      await service.applyImageScore('t1', 'c1', 0.8, []);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.riskLevel).toBe('HIGH');
    });

    it('marks riskLevel MEDIUM when totalScore >= 0.3 and < 0.6', async () => {
      // behavioral=0, image=0.5 → total = 0 + 0.325 = 0.325
      mockTx.fraudScore.findUnique.mockResolvedValue({ behavioralScore: 0, flags: [] });
      await service.applyImageScore('t1', 'c1', 0.5, []);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.riskLevel).toBe('MEDIUM');
    });

    it('uses 0 behavioral score when no prior fraud record exists', async () => {
      // no prior record → behavioral defaults to 0
      // total = 0 * 0.35 + 0.5 * 0.65 = 0.325
      mockTx.fraudScore.findUnique.mockResolvedValue(null);
      await service.applyImageScore('t1', 'c1', 0.5, []);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.totalScore).toBeCloseTo(0.325, 3);
    });

    it('merges incoming flags with existing behavioral flags', async () => {
      const existing = [{ type: 'HIGH_CLAIM_VELOCITY', description: '3 claims', severity: 'HIGH' }];
      const incoming = [{ type: 'IMAGE_FORGERY', description: 'ELA high', severity: 'HIGH' }];
      mockTx.fraudScore.findUnique.mockResolvedValue({ behavioralScore: 0.2, flags: existing });
      await service.applyImageScore('t1', 'c1', 0.6, incoming);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.flags).toHaveLength(2);
    });

    it('caps totalScore at 1.0 even with extreme inputs', async () => {
      mockTx.fraudScore.findUnique.mockResolvedValue({ behavioralScore: 1.0, flags: [] });
      await service.applyImageScore('t1', 'c1', 1.0, []);
      expect(mockTx.fraudScore.upsert.mock.calls[0][0].update.totalScore).toBeLessThanOrEqual(1.0);
    });
  });
});
