import Anthropic from '@anthropic-ai/sdk';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getDb, schema } from '../db/index.js';
import { calculateCost } from '../config/llm-pricing.js';
import { logger } from './logger.js';

// ── Tracking context ──

export interface LlmTrackingContext {
  clientId?: string;
  jobId?: string;
}

const trackingStore = new AsyncLocalStorage<LlmTrackingContext>();

/** Run a function with LLM tracking context (clientId, jobId). */
export function withLlmContext<T>(ctx: LlmTrackingContext, fn: () => Promise<T>): Promise<T> {
  return trackingStore.run(ctx, fn);
}

/** Get the current tracking context (returns empty object if none). */
export function getLlmContext(): LlmTrackingContext {
  return trackingStore.getStore() ?? {};
}

// ── Tracked client factory ──

export interface TrackedAnthropicOptions {
  apiKey: string;
  service: string;
}

/**
 * Creates an Anthropic client that automatically records token usage
 * for every messages.create() call. The returned object has the same
 * interface as `new Anthropic()`, so services don't change their code.
 */
export function createTrackedAnthropicClient(opts: TrackedAnthropicOptions): Anthropic {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const originalCreate = client.messages.create.bind(client.messages);

  // Override create to intercept responses
  const trackedCreate = async function (
    ...args: Parameters<typeof originalCreate>
  ): Promise<Anthropic.Message> {
    const params = args[0] as Anthropic.MessageCreateParamsNonStreaming;
    const model = params.model ?? 'unknown';

    const response = await originalCreate(params) as Anthropic.Message;

    // Record usage asynchronously (fire-and-forget)
    if (response.usage) {
      recordUsage({
        service: opts.service,
        operation: inferOperation(opts.service, params),
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(err => {
        logger.warn({ err, service: opts.service }, 'Failed to record LLM usage');
      });
    }

    return response;
  };

  // Replace the create method while preserving the type
  client.messages.create = trackedCreate as typeof client.messages.create;

  return client;
}

// ── Internal helpers ──

interface UsageRecord {
  service: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function recordUsage(record: UsageRecord): Promise<void> {
  const ctx = getLlmContext();
  const cost = calculateCost(record.model, record.inputTokens, record.outputTokens);

  const db = getDb();
  await db.insert(schema.llmUsage).values({
    clientId: ctx.clientId ?? null,
    jobId: ctx.jobId ?? null,
    service: record.service,
    operation: record.operation,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    inputCostUsd: String(cost.inputCostUsd),
    outputCostUsd: String(cost.outputCostUsd),
    totalCostUsd: String(cost.totalCostUsd),
  });

  logger.debug({
    service: record.service,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    costUsd: cost.totalCostUsd.toFixed(6),
    clientId: ctx.clientId,
    jobId: ctx.jobId,
  }, 'LLM usage recorded');
}

const SERVICE_OPERATION_MAP: Record<string, string> = {
  'signal-detector': 'signal_detection',
  'market-signal-processor': 'signal_classification',
  'market-signal-searcher': 'query_generation',
  'deep-enrichment': 'pestle_profile',
  'engagement-brief': 'brief_generation',
  'persona-signal-detector': 'persona_analysis',
  'client-profile': 'website_analysis',
  'strategy-generator': 'strategy_generation',
  'hypothesis-generator': 'hypothesis_generation',
  'icp-parser': 'icp_parsing',
  'company-discovery': 'company_discovery',
  'market-buzz': 'buzz_generation',
};

function inferOperation(service: string, _params: Anthropic.MessageCreateParamsNonStreaming): string {
  return SERVICE_OPERATION_MAP[service] ?? 'llm_call';
}
