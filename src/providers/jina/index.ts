import { BaseProvider } from '../base.js';
import type { DataProvider, ProviderCapability } from '../types.js';
import type { JinaReadResponse } from './types.js';
import { logger } from '../../lib/logger.js';

const CANDIDATE_PATHS = [
  '/about', '/about-us', '/company',
  '/products', '/services', '/solutions', '/platform',
  '/pricing',
];

const MAX_PAGES = 4;
const MAX_COMBINED_CHARS = 15_000;

export class JinaProvider extends BaseProvider implements Partial<DataProvider> {
  readonly name = 'jina';
  readonly displayName = 'Jina Reader';
  readonly capabilities: ProviderCapability[] = ['company_enrich'];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://r.jina.ai',
      rateLimit: { perSecond: 8, perMinute: 500 },
    });
    this.log = logger.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'X-Return-Format': 'markdown',
    };
  }

  /**
   * Read a single URL and return its markdown content.
   * Returns null on 404 or other failures (non-throwing).
   */
  async readUrl(url: string): Promise<{ content: string; title?: string } | null> {
    try {
      const response = await this.request<JinaReadResponse>('post', '', {
        body: { url },
        timeout: 30_000,
      });
      if (!response.data?.content) return null;
      return { content: response.data.content, title: response.data.title };
    } catch {
      // 404s, timeouts, etc. — non-fatal for page discovery
      return null;
    }
  }

  /**
   * Scrape key pages of a company website and return combined markdown.
   * Tries homepage + up to 3-4 informational pages.
   * Returns combined content capped at ~15k chars.
   */
  async scrapeCompanyWebsite(domain: string): Promise<string> {
    const log = this.log.child({ domain });
    const sections: string[] = [];
    let totalChars = 0;

    // Always start with homepage
    const homepage = await this.readUrl(`https://${domain}`);
    if (homepage?.content) {
      const chunk = homepage.content.slice(0, 5000);
      sections.push(`## Homepage\n${chunk}`);
      totalChars += chunk.length;
      log.debug({ chars: chunk.length }, 'Scraped homepage');
    }

    // Try candidate pages
    let pagesScraped = 0;
    for (const path of CANDIDATE_PATHS) {
      if (pagesScraped >= MAX_PAGES - 1) break; // -1 for homepage
      if (totalChars >= MAX_COMBINED_CHARS) break;

      const result = await this.readUrl(`https://${domain}${path}`);
      if (result?.content && result.content.length > 200) {
        const remaining = MAX_COMBINED_CHARS - totalChars;
        const chunk = result.content.slice(0, Math.min(4000, remaining));
        sections.push(`## ${path}\n${chunk}`);
        totalChars += chunk.length;
        pagesScraped++;
        log.debug({ path, chars: chunk.length }, 'Scraped page');
      }
    }

    log.info({ pages: pagesScraped + (homepage?.content ? 1 : 0), totalChars }, 'Website scrape complete');
    return sections.join('\n\n');
  }
}
