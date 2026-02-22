import type { UnifiedCompany } from '../types.js';
import type { ExaSearchResult } from './types.js';

export function mapExaResultToCompany(result: ExaSearchResult): UnifiedCompany {
  const domain = extractDomain(result.url);
  const name = result.title?.replace(/ [-|–—].*/,  '').trim() ?? domain ?? 'Unknown';

  return {
    name,
    domain,
    websiteUrl: result.url,
    description: result.text?.slice(0, 1000),
    externalIds: { exa: result.id },
  };
}

function extractDomain(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
