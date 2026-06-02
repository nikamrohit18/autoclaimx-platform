import { Module } from '@nestjs/common';
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const METRIC_NEGOTIATION_ROUNDS = 'negotiation_rounds_total';
export const METRIC_NEGOTIATION_OUTCOMES = 'negotiation_outcomes_total';
export const METRIC_AI_INFERENCE_DURATION = 'ai_inference_duration_seconds';

const providers = [
  makeCounterProvider({
    name: METRIC_NEGOTIATION_ROUNDS,
    help: 'Total negotiation rounds completed',
    labelNames: ['offerer', 'style'],
  }),
  makeCounterProvider({
    name: METRIC_NEGOTIATION_OUTCOMES,
    help: 'Negotiation session outcomes',
    labelNames: ['outcome'],
  }),
  makeHistogramProvider({
    name: METRIC_AI_INFERENCE_DURATION,
    help: 'Duration of AI LLM inference calls in seconds',
    labelNames: ['service'],
    buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  }),
];

@Module({ providers, exports: providers })
export class MetricsModule {}
