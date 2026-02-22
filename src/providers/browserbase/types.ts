// ── Browserbase API types ──

export interface BrowserbaseSession {
  id: string;
  projectId: string;
  status: 'RUNNING' | 'ERROR' | 'TIMED_OUT' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
  connectUrl: string;
  seleniumRemoteUrl?: string;
  region?: string;
  keepAlive: boolean;
}

export interface BrowserbaseCreateSessionParams {
  projectId: string;
  browserSettings?: {
    blockAds?: boolean;
    solveCaptchas?: boolean;
    viewport?: { width: number; height: number };
  };
  timeout?: number;
  keepAlive?: boolean;
  proxies?: boolean;
  region?: string;
}

// ── Page extraction types ──

export interface PageExtraction {
  title?: string;
  description?: string;
  ogData: Record<string, string>;
  jsonLd: JsonLdOrganization[];
  textContent: string;
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  emails: string[];
  phones: string[];
}

export interface JsonLdOrganization {
  '@type'?: string;
  name?: string;
  description?: string;
  url?: string;
  logo?: string | { url?: string };
  foundingDate?: string;
  numberOfEmployees?: { value?: number } | number;
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
    streetAddress?: string;
  };
  sameAs?: string[];
  telephone?: string;
  industry?: string;
}
