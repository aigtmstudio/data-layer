import { chromium } from 'playwright-core';
import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanyEnrichParams,
  UnifiedCompany,
  ProviderResponse,
} from '../types.js';
import { mapPageExtractionToCompany } from './mappers.js';
import type {
  BrowserbaseSession,
  PageExtraction,
  JsonLdOrganization,
} from './types.js';

interface RawExtraction {
  title?: string;
  description?: string;
  ogData?: Record<string, string>;
  jsonLd?: unknown[];
  textContent?: string;
  socialLinks?: { linkedin?: string; twitter?: string; github?: string };
  emails?: string[];
  phones?: string[];
}

const SESSION_TIMEOUT = 120; // seconds
const PAGE_TIMEOUT = 30_000; // ms

export class BrowserbaseProvider extends BaseProvider implements DataProvider {
  readonly name = 'browserbase';
  readonly displayName = 'Browserbase';
  readonly capabilities: ProviderCapability[] = ['company_enrich'];

  private projectId: string;

  constructor(apiKey: string, projectId: string) {
    super({
      apiKey,
      baseUrl: 'https://api.browserbase.com/v1',
      rateLimit: { perSecond: 2, perMinute: 50 },
    });
    this.projectId = projectId;
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-bb-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    if (!params.domain) {
      return {
        success: false, data: null, error: 'Domain required for Browserbase enrichment',
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }

    let sessionId: string | undefined;

    try {
      // 1. Create browser session
      const session = await this.request<BrowserbaseSession>('post', '/sessions', {
        body: {
          projectId: this.projectId,
          browserSettings: {
            blockAds: true,
            viewport: { width: 1920, height: 1080 },
          },
          timeout: SESSION_TIMEOUT,
          keepAlive: false,
        },
      });
      sessionId = session.id;

      // 2. Connect via CDP and extract page data
      const extraction = await this.scrapeUrl(session.connectUrl, `https://${params.domain}`);

      // 3. Map to unified company
      const unified = mapPageExtractionToCompany(extraction, params.domain);
      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: 1,
        fieldsPopulated,
        qualityScore: Math.min(fieldsPopulated.length / 15, 1),
      };
    } catch (error) {
      this.log.error({ error, params }, 'Company enrichment failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  private async scrapeUrl(connectUrl: string, url: string): Promise<PageExtraction> {
    const browser = await chromium.connectOverCDP(connectUrl);

    try {
      const context = browser.contexts()[0] ?? await browser.newContext();
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

      // Extract all useful data in a single evaluate call.
      // Uses a string expression so TypeScript doesn't require DOM lib types.
      const extraction = await page.evaluate(EXTRACT_SCRIPT) as RawExtraction;

      return {
        title: extraction.title,
        description: extraction.description,
        ogData: extraction.ogData ?? {},
        jsonLd: (extraction.jsonLd ?? []) as JsonLdOrganization[],
        textContent: extraction.textContent ?? '',
        socialLinks: extraction.socialLinks ?? {},
        emails: extraction.emails ?? [],
        phones: extraction.phones ?? [],
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }
}

// Browser-side extraction script (runs inside Playwright page.evaluate).
// Defined as a string to avoid needing DOM lib types in the Node.js tsconfig.
const EXTRACT_SCRIPT = `(() => {
  const getMeta = (name) => {
    const el = document.querySelector('meta[property="' + name + '"]')
            || document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : undefined;
  };

  const ogKeys = ['og:title','og:description','og:image','og:site_name','og:type','article:section'];
  const ogData = {};
  for (const key of ogKeys) { const v = getMeta(key); if (v) ogData[key] = v; }

  const jsonLdItems = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const p = JSON.parse(script.textContent || '');
      if (Array.isArray(p)) jsonLdItems.push(...p);
      else if (p['@graph']) jsonLdItems.push(...p['@graph']);
      else jsonLdItems.push(p);
    } catch {}
  }

  const socialLinks = {};
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || '';
    if (h.includes('linkedin.com/company') && !socialLinks.linkedin) socialLinks.linkedin = h;
    else if ((h.includes('twitter.com/') || h.includes('x.com/')) && !socialLinks.twitter) socialLinks.twitter = h;
    else if (h.includes('github.com/') && !socialLinks.github) socialLinks.github = h;
  }

  const bodyText = (document.body && document.body.innerText) || '';
  const emailRe = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/g;
  const phoneRe = /\\+?[\\d\\s\\-().]{10,}/g;
  const emails = [...new Set(bodyText.match(emailRe) || [])].slice(0, 5);
  const phones = [...new Set((bodyText.match(phoneRe) || []).map(function(p){return p.trim()}))].slice(0, 3);

  return {
    title: document.title || undefined,
    description: getMeta('description'),
    ogData,
    jsonLd: jsonLdItems,
    textContent: bodyText.slice(0, 5000),
    socialLinks,
    emails,
    phones,
  };
})()`;
