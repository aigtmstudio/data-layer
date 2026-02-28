import type { UnifiedCompany } from '../../providers/types.js';
import type { IcpFilters } from '../../db/schema/icps.js';
import type { SourceRecord } from '../../db/schema/companies.js';
import { scoreCompanyFit } from '../icp-engine/scorer.js';
import { getProviderOriginalityWeight, SIGNAL_DEFINITIONS } from './provider-knowledge.js';
import type { DetectedSignal } from './signal-detector.js';
import { applyTimeliness } from './timeliness.js';

export interface ScoringWeights {
  icpFit: number;
  signals: number;
  originality: number;
  costEfficiency: number;
}

export interface IntelligenceScoreResult {
  intelligenceScore: number;
  icpFitScore: number;
  signalScore: number;
  originalityScore: number;
  costEfficiencyScore: number;
  breakdown: Record<string, number>;
  reasons: string[];
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  icpFit: 0.35,
  signals: 0.30,
  originality: 0.20,
  costEfficiency: 0.15,
};

export class IntelligenceScorer {
  /**
   * Score a company using the composite intelligence algorithm.
   * Combines ICP fit, buying signals, data originality, and cost efficiency.
   */
  scoreCompany(
    company: UnifiedCompany,
    icpFilters: IcpFilters,
    signals: DetectedSignal[],
    sources: SourceRecord[],
    totalCostCredits: number,
    weights?: Partial<ScoringWeights>,
    signalPriorities?: { signalType: string; weight: number }[],
  ): IntelligenceScoreResult {
    const w = { ...DEFAULT_WEIGHTS, ...weights };
    const reasons: string[] = [];

    // 1. ICP Fit Score (reuse existing scorer)
    const icpResult = scoreCompanyFit(company, icpFilters);
    const icpFitScore = icpResult.score;
    reasons.push(...icpResult.reasons);

    // 2. Signal Score
    const signalScore = this.computeSignalScore(signals, signalPriorities);
    if (signals.length > 0) {
      reasons.push(`${signals.length} buying signal(s) detected`);
      const topSignal = signals.sort((a, b) => b.signalStrength - a.signalStrength)[0];
      reasons.push(`Strongest: ${SIGNAL_DEFINITIONS[topSignal.signalType]?.displayName ?? topSignal.signalType} (${(topSignal.signalStrength * 100).toFixed(0)}%)`);
    }

    // 3. Originality Score
    const originalityScore = this.computeOriginalityScore(sources);
    if (originalityScore > 0.7) {
      reasons.push('High originality — found via niche providers');
    } else if (originalityScore < 0.3) {
      reasons.push('Low originality — found via common providers');
    }

    // 4. Cost Efficiency Score
    const costEfficiencyScore = this.computeCostEfficiency(totalCostCredits, sources.length);

    // Composite score
    const intelligenceScore = Math.round(
      (icpFitScore * w.icpFit +
        signalScore * w.signals +
        originalityScore * w.originality +
        costEfficiencyScore * w.costEfficiency) * 100,
    ) / 100;

    return {
      intelligenceScore,
      icpFitScore,
      signalScore,
      originalityScore,
      costEfficiencyScore,
      breakdown: {
        ...icpResult.breakdown,
        signalScore,
        originalityScore,
        costEfficiencyScore,
      },
      reasons,
    };
  }

  private computeSignalScore(
    signals: DetectedSignal[],
    signalPriorities?: { signalType: string; weight: number }[],
  ): number {
    if (signals.length === 0) return 0;

    const priorityMap = new Map(
      signalPriorities?.map(p => [p.signalType, p.weight]) ?? [],
    );

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      // Use strategy-defined priority weight, or fall back to default from knowledge base
      const priority = priorityMap.get(signal.signalType)
        ?? SIGNAL_DEFINITIONS[signal.signalType]?.defaultWeight
        ?? 0.5;

      const adjustedStrength = applyTimeliness(signal.signalStrength, signal.eventDate ?? (signal.details as Record<string, unknown>)?.eventDate as string | undefined);
      weightedSum += adjustedStrength * priority;
      totalWeight += priority;
    }

    return totalWeight > 0
      ? Math.min(weightedSum / totalWeight, 1)
      : 0;
  }

  private computeOriginalityScore(sources: SourceRecord[]): number {
    if (sources.length === 0) return 0.5;

    // Calculate weighted originality based on which providers found this company
    let totalOriginalityWeight = 0;
    for (const source of sources) {
      totalOriginalityWeight += getProviderOriginalityWeight(source.source);
    }

    // Average originality across sources
    return Math.min(totalOriginalityWeight / sources.length, 1);
  }

  private computeCostEfficiency(totalCostCredits: number, providerCount: number): number {
    // Lower cost = higher score
    // Baseline: 1 credit per provider is "expected"
    const expectedCost = providerCount;
    if (totalCostCredits <= 0) return 1;
    if (expectedCost <= 0) return 0.5;

    const ratio = expectedCost / totalCostCredits;
    return Math.min(ratio, 1);
  }
}
