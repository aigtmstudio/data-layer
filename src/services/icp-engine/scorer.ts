import type { IcpFilters } from '../../db/schema/icps.js';
import type { UnifiedCompany } from '../../providers/types.js';

interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  reasons: string[];
}

// Country alias map for fuzzy geography matching
const COUNTRY_ALIASES: Record<string, string[]> = {
  us: ['united states', 'usa', 'united states of america', 'u.s.', 'u.s.a.'],
  uk: ['united kingdom', 'great britain', 'gb', 'england', 'britain'],
  uae: ['united arab emirates'],
  de: ['germany', 'deutschland'],
  fr: ['france'],
  nl: ['netherlands', 'holland'],
  kr: ['south korea', 'korea'],
  cn: ['china', 'prc'],
  ca: ['canada'],
  au: ['australia'],
  in: ['india'],
  il: ['israel'],
  sg: ['singapore'],
  jp: ['japan'],
  br: ['brazil'],
  se: ['sweden'],
  ie: ['ireland'],
  es: ['spain'],
  it: ['italy'],
};

function normalizeCountry(country: string): string {
  const lower = country.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (lower === canonical || aliases.includes(lower)) return canonical;
  }
  return lower;
}

export function scoreCompanyFit(company: UnifiedCompany, filters: IcpFilters): ScoreResult {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  let totalWeight = 0;
  let totalScore = 0;

  // Hard exclusion: excluded industries
  if (filters.excludeIndustries?.length && company.industry) {
    const ci = company.industry.toLowerCase();
    const excluded = filters.excludeIndustries.some(ex => {
      const lower = ex.toLowerCase();
      return ci.includes(lower) || lower.includes(ci);
    });
    if (excluded) {
      return {
        score: 0,
        breakdown: { excluded: 1 },
        reasons: [`Excluded industry: ${company.industry}`],
      };
    }
  }

  // Hard exclusion: excluded keywords in name or description
  if (filters.excludeKeywords?.length) {
    const searchText = [company.name, company.description].filter(Boolean).join(' ').toLowerCase();
    const matchedKeyword = filters.excludeKeywords.find(kw => searchText.includes(kw.toLowerCase()));
    if (matchedKeyword) {
      return {
        score: 0,
        breakdown: { excluded: 1 },
        reasons: [`Excluded keyword match: "${matchedKeyword}"`],
      };
    }
  }

  // Hard exclusion: excluded domains
  if (filters.excludeDomains?.length && company.domain) {
    const cd = company.domain.toLowerCase().replace(/^www\./, '');
    const excluded = filters.excludeDomains.some(d => d.toLowerCase().replace(/^www\./, '') === cd);
    if (excluded) {
      return {
        score: 0,
        breakdown: { excluded: 1 },
        reasons: [`Excluded domain: ${company.domain}`],
      };
    }
  }

  // Industry match (weight: 3)
  // Skip if company has no industry data — don't penalise unknown fields
  if (filters.industries?.length) {
    if (company.industry) {
      const weight = 3;
      totalWeight += weight;
      const companyIndustry = company.industry.toLowerCase();
      // Bidirectional includes: "SaaS" matches "Enterprise SaaS" and vice versa
      const match = filters.industries.some(i => {
        const target = i.toLowerCase();
        return companyIndustry.includes(target) || target.includes(companyIndustry);
      });
      breakdown.industry = match ? 1 : 0;
      totalScore += breakdown.industry * weight;
      if (match) reasons.push(`Industry match: ${company.industry}`);
    } else {
      breakdown.industry = -1; // Unknown — skipped
    }
  }

  // Employee count (weight: 2)
  // Skip if company has no employee count data
  if (filters.employeeCountMin != null || filters.employeeCountMax != null) {
    const count = company.employeeCount ?? 0;
    if (count > 0) {
      const weight = 2;
      totalWeight += weight;
      const inRange =
        (filters.employeeCountMin == null || count >= filters.employeeCountMin) &&
        (filters.employeeCountMax == null || count <= filters.employeeCountMax);
      breakdown.employeeCount = inRange ? 1 : 0;
      totalScore += breakdown.employeeCount * weight;
      if (inRange) reasons.push(`Employee count ${count} in range`);
    } else {
      breakdown.employeeCount = -1; // Unknown — skipped
    }
  }

  // Geography (weight: 2)
  // Uses normalized country matching (US <-> United States etc.)
  if (filters.countries?.length) {
    if (company.country) {
      const weight = 2;
      totalWeight += weight;
      const companyNorm = normalizeCountry(company.country);
      const match = filters.countries.some(c => normalizeCountry(c) === companyNorm);
      breakdown.geography = match ? 1 : 0;
      totalScore += breakdown.geography * weight;
      if (match) reasons.push(`Country match: ${company.country}`);
    } else {
      breakdown.geography = -1; // Unknown — skipped
    }
  }

  // Revenue (weight: 2)
  // Skip if company has no revenue data
  if (filters.revenueMin != null || filters.revenueMax != null) {
    const rev = company.annualRevenue ?? 0;
    if (rev > 0) {
      const weight = 2;
      totalWeight += weight;
      const inRange =
        (filters.revenueMin == null || rev >= filters.revenueMin) &&
        (filters.revenueMax == null || rev <= filters.revenueMax);
      breakdown.revenue = inRange ? 1 : 0.3;
      totalScore += breakdown.revenue * weight;
      if (inRange) reasons.push(`Revenue $${rev} in range`);
    } else {
      breakdown.revenue = -1; // Unknown — skipped
    }
  }

  // Tech stack (weight: 2)
  // Only score if BOTH filter and company have tech stack data
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
  // Skip if company has no funding data
  if (filters.fundingStages?.length) {
    if (company.latestFundingStage) {
      const weight = 1;
      totalWeight += weight;
      const match = filters.fundingStages.some(f =>
        company.latestFundingStage!.toLowerCase().includes(f.toLowerCase()),
      );
      breakdown.funding = match ? 1 : 0;
      totalScore += breakdown.funding * weight;
      if (match) reasons.push(`Funding stage match: ${company.latestFundingStage}`);
    } else {
      breakdown.funding = -1; // Unknown — skipped
    }
  }

  // Founded year (weight: 1)
  // Skip if company has no founded year data
  if (filters.foundedAfter != null || filters.foundedBefore != null) {
    const year = company.foundedYear ?? 0;
    if (year > 0) {
      const weight = 1;
      totalWeight += weight;
      const inRange =
        (filters.foundedAfter == null || year >= filters.foundedAfter) &&
        (filters.foundedBefore == null || year <= filters.foundedBefore);
      breakdown.foundedYear = inRange ? 1 : 0;
      totalScore += breakdown.foundedYear * weight;
      if (inRange) reasons.push(`Founded ${year} in range`);
    } else {
      breakdown.foundedYear = -1; // Unknown — skipped
    }
  }

  // If no filters are configured or all fields were unknown, give a neutral score
  // (companies matched provider search criteria, so they're likely relevant)
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;

  return {
    score: Math.round(finalScore * 100) / 100,
    breakdown,
    reasons: totalWeight === 0
      ? ['No scoreable data — default score (company matched provider search criteria)']
      : reasons,
  };
}
