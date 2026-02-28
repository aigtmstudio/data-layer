export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const LLM_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 1.00,
    outputPerMTok: 5.00,
  },
  'claude-sonnet-4-20250514': {
    inputPerMTok: 3.00,
    outputPerMTok: 15.00,
  },
};

// Fallback to most expensive model pricing to avoid under-counting
const FALLBACK_PRICING = LLM_PRICING['claude-sonnet-4-20250514'];

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number } {
  const pricing = LLM_PRICING[model] ?? FALLBACK_PRICING;
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return { inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd };
}
