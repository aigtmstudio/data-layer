import type { UnifiedCompany } from '../types.js';
import type { TavilySearchResult } from './types.js';

export function mapTavilyResultToCompany(result: TavilySearchResult): UnifiedCompany {
  const domain = extractDomain(result.url);
  const name = result.title?.replace(/ [-|–—].*/,  '').trim() ?? domain ?? 'Unknown';

  return {
    name,
    domain,
    websiteUrl: result.url,
    description: result.content?.slice(0, 1000),
    externalIds: { tavily: result.url },
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
