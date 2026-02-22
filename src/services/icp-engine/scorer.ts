import type { IcpFilters } from '../../db/schema/icps.js';
import type { UnifiedCompany } from '../../providers/types.js';

interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  reasons: string[];
}

export function scoreCompanyFit(company: UnifiedCompany, filters: IcpFilters): ScoreResult {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  let totalWeight = 0;
  let totalScore = 0;

  // Industry match (weight: 3)
  if (filters.industries?.length) {
    const weight = 3;
    totalWeight += weight;
    const match = filters.industries.some(i =>
      company.industry?.toLowerCase().includes(i.toLowerCase()),
    );
    breakdown.industry = match ? 1 : 0;
    totalScore += breakdown.industry * weight;
    if (match) reasons.push(`Industry match: ${company.industry}`);
  }

  // Employee count (weight: 2)
  if (filters.employeeCountMin != null || filters.employeeCountMax != null) {
    const weight = 2;
    totalWeight += weight;
    const count = company.employeeCount ?? 0;
    if (count > 0) {
      const inRange =
        (filters.employeeCountMin == null || count >= filters.employeeCountMin) &&
        (filters.employeeCountMax == null || count <= filters.employeeCountMax);
      breakdown.employeeCount = inRange ? 1 : 0;
      totalScore += breakdown.employeeCount * weight;
      if (inRange) reasons.push(`Employee count ${count} in range`);
    } else {
      breakdown.employeeCount = 0;
    }
  }

  // Geography (weight: 2)
  if (filters.countries?.length) {
    const weight = 2;
    totalWeight += weight;
    const match = filters.countries.some(c =>
      company.country?.toUpperCase() === c.toUpperCase(),
    );
    breakdown.geography = match ? 1 : 0;
    totalScore += breakdown.geography * weight;
    if (match) reasons.push(`Country match: ${company.country}`);
  }

  // Revenue (weight: 2)
  if (filters.revenueMin != null || filters.revenueMax != null) {
    const weight = 2;
    totalWeight += weight;
    const rev = company.annualRevenue ?? 0;
    if (rev > 0) {
      const inRange =
        (filters.revenueMin == null || rev >= filters.revenueMin) &&
        (filters.revenueMax == null || rev <= filters.revenueMax);
      breakdown.revenue = inRange ? 1 : 0.3;
      totalScore += breakdown.revenue * weight;
      if (inRange) reasons.push(`Revenue $${rev} in range`);
    } else {
      breakdown.revenue = 0;
    }
  }

  // Tech stack (weight: 2)
  if (filters.techStack?.length && company.techStack?.length) {
    const weight = 2;
    totalWeight += weight;
    const matchCount = filters.techStack.filter(t =>
      company.techStack!.some(ct => ct.toLowerCase().includes(t.toLowerCase())),
    ).length;
    breakdown.techStack = matchCount / filters.techStack.length;
    totalScore += breakdown.techStack * weight;
    if (matchCount > 0) reasons.push(`Tech match: ${matchCount}/${filters.techStack.length}`);
  }

  // Funding stage (weight: 1)
  if (filters.fundingStages?.length) {
    const weight = 1;
    totalWeight += weight;
    const match = filters.fundingStages.some(f =>
      company.latestFundingStage?.toLowerCase().includes(f.toLowerCase()),
    );
    breakdown.funding = match ? 1 : 0;
    totalScore += breakdown.funding * weight;
    if (match) reasons.push(`Funding stage match: ${company.latestFundingStage}`);
  }

  // Founded year (weight: 1)
  if (filters.foundedAfter != null || filters.foundedBefore != null) {
    const weight = 1;
    totalWeight += weight;
    const year = company.foundedYear ?? 0;
    if (year > 0) {
      const inRange =
        (filters.foundedAfter == null || year >= filters.foundedAfter) &&
        (filters.foundedBefore == null || year <= filters.foundedBefore);
      breakdown.foundedYear = inRange ? 1 : 0;
      totalScore += breakdown.foundedYear * weight;
      if (inRange) reasons.push(`Founded ${year} in range`);
    } else {
      breakdown.foundedYear = 0;
    }
  }

  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  return {
    score: Math.round(finalScore * 100) / 100,
    breakdown,
    reasons,
  };
}
