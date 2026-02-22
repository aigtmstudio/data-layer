# Data Layer — Architecture & Technical Spec

A B2B sales intelligence platform that aggregates 13 data providers behind a unified API, with an AI-driven intelligence layer for strategy generation, signal detection, and dynamic provider selection.

**Stack:** TypeScript, Node.js, Fastify 5, Drizzle ORM, PostgreSQL (Supabase), pg-boss job queue, Anthropic Claude SDK. Frontend: Next.js 15, shadcn/ui, TanStack Query/Table, Zustand.

---

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Database Schema](#database-schema)
3. [Data Providers](#data-providers)
4. [Services](#services)
5. [API Routes](#api-routes)
6. [Intelligence Layer](#intelligence-layer)
7. [ICP & Persona Builder](#icp--persona-builder)
8. [Frontend](#frontend)
9. [Configuration](#configuration)
10. [Key Interfaces & Types](#key-interfaces--types)
11. [Startup Flow](#startup-flow)
12. [Scripts & Tooling](#scripts--tooling)

---

## Directory Structure

```
src/
├── index.ts                              # Entry point, ServiceContainer, provider wiring
├── api/
│   ├── index.ts                          # Fastify app builder (cors, multipart, auth, routes)
│   ├── plugins/
│   │   ├── auth.ts                       # API key auth (x-api-key header)
│   │   └── error-handler.ts              # Global error handler
│   └── routes/
│       ├── clients.ts                    # Client CRUD
│       ├── credits.ts                    # Credit balance & transactions
│       ├── enrichment.ts                 # Async enrichment job trigger
│       ├── exports.ts                    # List export (CSV/Excel/Sheets)
│       ├── icps.ts                       # ICP CRUD + multi-source upload/parse
│       ├── intelligence.ts               # Client profiles, strategies, signals, intelligent lists
│       ├── jobs.ts                       # Job status & cancellation
│       ├── lists.ts                      # List CRUD + build + schedule
│       └── personas.ts                   # Persona CRUD + auto-generate
├── config/
│   ├── index.ts                          # Zod-validated env vars
│   └── sources.ts                        # Static provider config defaults (13 providers)
├── db/
│   ├── index.ts                          # DB connection (postgres driver)
│   └── schema/
│       ├── index.ts                      # Re-exports all tables
│       ├── enums.ts                      # pgEnum definitions
│       ├── clients.ts                    # clients table
│       ├── companies.ts                  # companies table (+ SourceRecord, originalityScore)
│       ├── contacts.ts                   # contacts table
│       ├── credits.ts                    # credit_transactions table
│       ├── data-sources.ts              # data_sources table (provider config in DB)
│       ├── icps.ts                       # icps table + IcpFilters + ProviderSearchHints
│       ├── intelligence.ts               # client_profiles, strategies, company_signals, provider_performance
│       ├── jobs.ts                       # jobs table
│       ├── lists.ts                      # lists + list_members tables
│       └── personas.ts                   # personas table
├── lib/
│   ├── document-extractor.ts             # PDF/DOCX/PPTX/TXT text extraction
│   ├── errors.ts                         # NotFoundError, ValidationError, InsufficientCreditsError
│   ├── http-client.ts                    # Base HTTP client (ky wrapper)
│   ├── logger.ts                         # Pino logger
│   ├── retry.ts                          # Exponential backoff retry utility
│   └── types.ts                          # Shared lib types
├── providers/
│   ├── base.ts                           # BaseProvider abstract (rate limiting, request helper)
│   ├── types.ts                          # UnifiedCompany, UnifiedContact, DataProvider interface
│   ├── apollo/                           # Apollo.io — search + enrich (company & people)
│   ├── leadmagic/                        # LeadMagic — enrich + email find
│   ├── prospeo/                          # Prospeo — email find + verify + people
│   ├── exa/                              # Exa — semantic company search + enrich
│   ├── tavily/                           # Tavily — search + extract company data
│   ├── apify/                            # Apify — LinkedIn scraping via actors
│   ├── parallel/                         # Parallel.ai — AI task runner
│   ├── valyu/                            # Valyu — structured data search
│   ├── diffbot/                          # Diffbot — knowledge graph (DQL search + Enhance)
│   ├── browserbase/                      # Browserbase — headless browser via Playwright CDP
│   ├── agentql/                          # AgentQL — semantic query extraction
│   ├── firecrawl/                        # Firecrawl — LLM extract with JSON schema
│   └── scrapegraph/                      # ScrapeGraphAI — SmartScraper + SearchScraper
└── services/
    ├── credit-manager/index.ts           # Credit balance, charge with margin, transactions
    ├── enrichment/index.ts               # Full pipeline: enrich -> contacts -> emails -> verify
    ├── export/                           # ExportEngine + CSV/Excel + Google Sheets
    ├── icp-engine/
    │   ├── parser.ts                     # IcpParser (NL + multi-source, Claude-backed)
    │   ├── scorer.ts                     # scoreCompanyFit() weighted scoring function
    │   └── source-processor.ts           # SourceProcessor (docs, transcripts, CSV, selectors)
    ├── intelligence/
    │   ├── client-profile.ts             # ClientProfileService (CRUD + website auto-enrich)
    │   ├── signal-detector.ts            # SignalDetector (rule-based + LLM)
    │   ├── intelligence-scorer.ts        # IntelligenceScorer (composite 4-axis scoring)
    │   ├── strategy-generator.ts         # StrategyGenerator (Claude-backed, 24h cache)
    │   ├── dynamic-orchestrator.ts       # DynamicOrchestrator (wraps SourceOrchestrator)
    │   ├── provider-knowledge.ts         # Static provider profiles & signal definitions
    │   └── provider-performance-tracker.ts # Records and queries provider metrics
    ├── list-builder/index.ts             # ListBuilder (ICP query + score + insert members)
    ├── scheduler/index.ts                # pg-boss backed job queue (list-refresh, enrichment, export)
    └── source-orchestrator/index.ts      # Waterfall provider runner (enrichCompany, searchPeople, findEmail)
```

---

## Database Schema

### Core Tables

**`clients`** — Multi-tenant root entity
- `id` (uuid PK), `name`, `slug` (unique), `industry`, `website`, `notes`
- `creditBalance` (numeric 12,4), `creditMarginPercent` (numeric 5,2, default 30%)
- `settings` (jsonb: crmConfig, googleSheetsConfig, maxMonthlyCredits)
- `isActive`, timestamps

**`companies`** — Enriched company records
- `id` (uuid PK), `clientId` (FK), `name`, `domain`, `linkedinUrl`, `websiteUrl`
- `industry`, `subIndustry`, `employeeCount`, `employeeRange`, `annualRevenue`, `revenueRange`
- `foundedYear`, `totalFunding`, `latestFundingStage`, `latestFundingDate`
- `city`, `state`, `country`, `address`, `techStack` (jsonb string[])
- `description`, `phone`, `logoUrl`
- `sources` (jsonb SourceRecord[]), `primarySource`, `enrichmentScore`
- `originalityScore` (numeric), `sourceRarityScores` (jsonb)
- `apolloId`, `leadmagicId`, timestamps
- Indexes: client+domain (unique), client+industry, client+country, client+employeeCount

**`contacts`** — People records with email verification
- `id` (uuid PK), `clientId` (FK), `companyId` (FK)
- `firstName`, `lastName`, `fullName`, `linkedinUrl`, `photoUrl`
- `title`, `seniority`, `department`, `companyName`, `companyDomain`
- `workEmail`, `personalEmail`, `emailVerificationStatus` (enum), `emailVerifiedAt`
- `phone`, `mobilePhone`, `city`, `state`, `country`
- `employmentHistory` (jsonb), `sources` (jsonb SourceRecord[])
- `apolloId`, `leadmagicId`, `prospeoId`, timestamps

**`icps`** — Ideal Customer Profiles
- `id` (uuid PK), `clientId` (FK), `name`, `description`
- `naturalLanguageInput` (text), `filters` (jsonb IcpFilters)
- `sources` (jsonb IcpSourceRecord[]) — tracks which source types were used
- `providerHints` (jsonb ProviderSearchHints) — pre-computed search queries
- `suggestedPersonaId` (uuid) — auto-generated persona
- `aiParsingConfidence`, `lastParsedAt`, `isActive`, timestamps

**`personas`** — Buyer personas linked to ICPs
- `id` (uuid PK), `icpId` (FK)
- `name`, `description`, `titlePatterns` (jsonb), `seniorityLevels` (jsonb), `departments` (jsonb)
- `countries`, `states`, `yearsExperienceMin/Max`, `excludeTitlePatterns`
- `isAutoGenerated` (boolean), `generatedFromIcpId` (uuid)
- `isActive`, timestamps

**`lists`** — Target lists built from ICPs
- `id` (uuid PK), `clientId` (FK), `icpId` (FK), `personaId` (FK), `strategyId` (FK)
- `name`, `description`, `type` (enum: company/contact/mixed)
- `filterSnapshot` (jsonb ListFilterSnapshot)
- `refreshEnabled`, `refreshCron`, `lastRefreshedAt`, `nextRefreshAt`
- `memberCount`, `companyCount`, `contactCount`, timestamps

**`list_members`** — Companies and contacts in lists
- `id` (uuid PK), `listId` (FK), `companyId` (FK), `contactId` (FK)
- `icpFitScore`, `signalScore`, `originalityScore`, `intelligenceScore` (all numeric 3,2)
- `addedReason`, `addedAt`, `removedAt` (soft-delete)

### Supporting Tables

**`credit_transactions`** — Ledger for credit usage
- `clientId`, `type` (purchase/usage/adjustment/refund), `amount`, `baseCost`, `marginAmount`, `balanceAfter`
- `description`, `dataSource`, `operationType`, `jobId`, `metadata`

**`data_sources`** — Provider configuration in DB
- `name` (unique), `displayName`, `type` (enum), `isActive`, `priority`
- `costPerOperation` (jsonb), rate limits (per second/minute/day), `capabilities`

**`jobs`** — Async job tracking
- `clientId`, `type` (enum: company_enrichment, contact_discovery, etc.), `status` (enum)
- `totalItems`, `processedItems`, `failedItems`, `input`, `output`, `errors`

### Intelligence Tables

**`client_profiles`** — Client business context for AI strategy
- `clientId` (unique FK), `industry`, `products` (jsonb), `targetMarket`, `competitors`, `valueProposition`
- `websiteData` (jsonb — auto-scraped), `lastScrapedAt`

**`strategies`** — AI-generated provider strategies (24h TTL cache)
- `clientId`, `icpId`, `personaId`, `contextHash` (unique per client+icp+persona)
- `strategy` (jsonb StrategyData: providerPlan, signalPriorities, scoringWeights, reasoning)
- `expiresAt`

**`company_signals`** — Detected buying signals
- `companyId`, `clientId`, `signalType`, `signalStrength` (0-1), `signalData`, `source`
- `detectedAt`, `expiresAt` (signals decay, default 90 days)

**`provider_performance`** — Feedback loop metrics
- `providerName`, `clientId`, `operation`, `qualityScore`, `responseTimeMs`, `fieldsPopulated`, `costCredits`

---

## Data Providers

13 providers registered in priority order (cheapest first). All implement the `DataProvider` interface and normalize to `UnifiedCompany`/`UnifiedContact`.

| # | Provider | Capabilities | Auth | Notes |
|---|----------|-------------|------|-------|
| 1 | Apollo | company_search, company_enrich, people_search, people_enrich | x-api-key | Structured API params (industries, employee ranges, locations) |
| 2 | LeadMagic | company_enrich, people_enrich, email_find | X-API-Key | |
| 3 | Prospeo | email_find, email_verify, people_enrich, people_search | Bearer | |
| 4 | Exa | company_search, company_enrich | x-api-key | Semantic search via `buildSearchQuery()` |
| 5 | Tavily | company_search, company_enrich | Bearer | 2-phase: search then extract |
| 6 | Apify | company_enrich, people_enrich | Bearer | LinkedIn scraping via actors, async polling |
| 7 | Parallel | company_enrich, people_enrich | x-api-key | AI task runner with polling |
| 8 | Valyu | company_search, company_enrich | x-api-key | Structured JSON schema extraction |
| 9 | Diffbot | company_search, company_enrich, people_search, people_enrich, email_find | ?token= query param | Knowledge graph DQL queries |
| 10 | Browserbase | company_enrich | x-bb-api-key | Headless browser via Playwright CDP |
| 11 | AgentQL | company_enrich | X-API-Key | Semantic query extraction |
| 12 | Firecrawl | company_search, company_enrich | Bearer | LLM extract with JSON schema |
| 13 | ScrapeGraph | company_search, company_enrich | SGAI-APIKEY | SmartScraper + SearchScraper |

**Provider architecture:** Each provider has `index.ts` (main class extending `BaseProvider`), `mappers.ts` (API response -> unified types), and `types.ts` (raw API types). `BaseProvider` handles rate limiting (token bucket per-second/per-minute) and the `request()` helper.

**Waterfall execution** (`SourceOrchestrator`): Providers are called in priority order. Each enrichment merges results — later providers fill gaps from earlier ones. Configurable `qualityThreshold` (0.7) and `maxProviders` (3). Supports `providerOverride` to use a custom order (used by intelligence layer).

---

## Services

### SourceOrchestrator (`src/services/source-orchestrator/index.ts`)
Central provider coordinator. Runs providers in waterfall order, merging results. Tracks timing for performance metrics.
- `enrichCompany(clientId, { domain?, name? }, config?)` — multi-provider company enrichment
- `searchPeople(clientId, params, config?)` — first-success people search
- `findEmail(clientId, params)` / `verifyEmail(clientId, params)` — first-success
- `setPerformanceTracker(tracker)` — wires performance recording
- `getRegisteredProviders()` — returns registered provider names

### EnrichmentPipeline (`src/services/enrichment/index.ts`)
Full multi-step pipeline for batch enrichment:
1. Enrich company (via orchestrator)
2. Discover contacts (people search)
3. Find emails for contacts
4. Verify emails
- Upserts companies/contacts by domain/LinkedIn
- Updates job progress throughout

### CreditManager (`src/services/credit-manager/index.ts`)
- `hasBalance(clientId, estimatedCost)` — pre-check
- `charge(clientId, { baseCost, source, operation, ... })` — debit with margin applied
- `addCredits(clientId, amount, type, description)` — credit
- `getBalance(clientId)` / `getTransactions(clientId, ...)`

### ListBuilder (`src/services/list-builder/index.ts`)
- `buildList({ clientId, listId, icpId, personaId?, limit? })` — queries companies matching ICP filters + providerHints keywords, scores with `scoreCompanyFit()`, inserts list_members for companies >= 0.5, matches contacts against persona patterns
- `refreshList(listId)` — soft-removes all members, rebuilds

### ExportEngine (`src/services/export/index.ts`)
- `export(clientId, listId, format, destination?)` — CSV, Excel (ExcelJS), Google Sheets; stubs for Salesforce/HubSpot

### Scheduler (`src/services/scheduler/index.ts`)
pg-boss backed. Job queues: `list-refresh`, `enrichment`, `export`. Supports cron scheduling for list auto-refresh.

---

## API Routes

Auth: `x-api-key` header on all routes. File uploads: `@fastify/multipart` with 10MB limit.

### Clients (`/api/clients`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List active clients |
| GET | `/:id` | Get client |
| POST | `/` | Create client |
| PATCH | `/:id` | Update client |

### ICPs (`/api/clients/:clientId/icps`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List active ICPs |
| POST | `/` | Create ICP (optional NL parsing) |
| PATCH | `/:id` | Update ICP |
| POST | `/:id/parse` | Re-parse NL input to structured filters |
| POST | `/:id/sources/document` | Upload PDF/DOCX/PPTX/TXT (multipart) |
| POST | `/:id/sources/transcript` | Paste transcript text (JSON body) |
| POST | `/:id/sources/classic` | Add classic filter selectors (JSON body) |
| POST | `/:id/sources/crm-csv` | Upload CRM CSV (multipart) |
| GET | `/:id/sources` | List pending sources |
| DELETE | `/:id/sources` | Clear pending sources |
| POST | `/:id/parse-sources` | Parse all pending sources into ICP + persona |
| POST | `/build` | Single-shot multipart: create ICP from all sources at once |

### Personas (`/api/clients/:clientId/icps/:icpId/personas`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List active personas |
| POST | `/` | Create persona |
| PATCH | `/:id` | Update persona |
| POST | `/auto-generate` | AI auto-generate persona from ICP data |

### Lists (`/api/lists`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List active lists (?clientId filter) |
| GET | `/:id` | Get list |
| POST | `/` | Create list |
| POST | `/:id/build` | Build list from ICP + persona |
| POST | `/:id/refresh` | Refresh list members |
| PATCH | `/:id/schedule` | Update refresh cron |
| GET | `/:id/members` | Paginated members with joined company/contact data |

### Enrichment (`/api/enrichment`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/companies` | Async enrich 1-1000 domains (returns job) |

### Credits (`/api/credits`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:clientId` | Balance + recent transactions |
| POST | `/:clientId/add` | Add credits |
| GET | `/:clientId/usage` | Transaction history |

### Jobs (`/api/jobs`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List jobs (?clientId, ?status) |
| GET | `/:id` | Get job |
| POST | `/:id/cancel` | Cancel job |

### Exports (`/api/exports`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Export list (csv/excel/google_sheets/salesforce/hubspot) |

### Intelligence (`/api/intelligence`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile/:clientId` | Get/create client profile |
| PATCH | `/profile/:clientId` | Update profile |
| POST | `/profile/:clientId/auto-enrich` | Scrape client website, extract profile |
| POST | `/strategy/generate` | Generate AI provider strategy |
| GET | `/signals/:companyId` | Get active signals for company |
| POST | `/lists/build` | Build intelligent list (AI-driven) |
| GET | `/performance/:clientId` | Provider performance stats |

---

## Intelligence Layer

The intelligence layer wraps (does not replace) the existing SourceOrchestrator. It dynamically selects providers and scores companies based on AI-generated strategy.

### Flow

```
Client Profile --> StrategyGenerator (Claude Sonnet) --> DynamicOrchestrator
                         |                                      |
                Signal Detector <------- Enrichment Pipeline (existing)
                         |
                IntelligenceScorer --> Ranked List Members
                         |
                ProviderPerformanceTracker (feedback loop)
```

### Components

**ClientProfileService** — Stores structured client business context (industry, products, competitors, value prop). Auto-enriches from client website using Claude Haiku to extract structured data.

**StrategyGenerator** — Claude Sonnet analyzes client profile + ICP + persona + provider knowledge + historical performance to generate a `StrategyData`:
- `providerPlan`: ordered list of providers with priority and reasoning
- `signalPriorities`: which signal types matter most for this client
- `scoringWeights`: custom weights for the 4-axis scoring
- `reasoning`: AI explanation of strategy
- Cached 24h by `contextHash` (hash of client+ICP+persona combo)

**SignalDetector** — Detects buying signals from enriched company data:
- Rule-based: recent_funding, hiring_surge, tech_adoption, expansion, leadership_change
- LLM-based: Claude Haiku analyzes company description + context for subtle intent signals
- Signals stored with strength (0-1) and expiry (90 days default)

**IntelligenceScorer** — Composite 4-axis scoring:
1. **ICP Fit** (default 35%) — reuses `scoreCompanyFit()` from icp-engine
2. **Signal Score** (30%) — aggregates detected signals weighted by relevance
3. **Originality Score** (20%) — rarity across providers (less common = more original)
4. **Cost Efficiency** (15%) — penalizes expensive-to-find companies

**DynamicOrchestrator** — Main entry point:
- `buildIntelligentList(params)` — generates strategy, queries companies, detects signals, scores with all 4 axes, inserts ranked list members
- `enrichWithStrategy(clientId, domains, strategy)` — enriches using strategy's provider order

**ProviderPerformanceTracker** — Records quality score, response time, fields populated, cost per provider call. Feeds back into strategy generation.

**Provider Knowledge** (`provider-knowledge.ts`) — Static knowledge base mapping each provider's strengths: industries, data uniqueness, cost-effectiveness, signal detection capabilities, freshness characteristics.

---

## ICP & Persona Builder

### Multi-Source Input

The ICP parser accepts up to 4 source types simultaneously:

1. **Document uploads** (PDF, DOCX, PPTX, text) — extracted via `DocumentExtractor` using pdf-parse, mammoth, jszip
2. **Call transcripts** (text paste) — cleaned of timestamps and speaker labels
3. **Classic selectors** — user-chosen structured filters (treated as hard constraints)
4. **CRM CSV uploads** — parsed with flexible column detection, analyzed for patterns

### Processing Pipeline

```
Sources --> SourceProcessor (normalize each type) --> IcpParser.parseFromSources()
    |                                                      |
    |   DocumentExtractor (PDF/DOCX/PPTX/TXT)             | Claude Sonnet
    |   CRM CSV --> CrmInsights (patterns)                 |
    |   Classic filters (pass-through)                     v
    |                                              IcpFilters + ProviderSearchHints
    |                                              + SuggestedPersona
```

### Provider-Optimized Output

`parseFromSources()` produces not just `IcpFilters` but also `ProviderSearchHints`:
- `semanticSearchQuery` — 2-3 sentence natural language query for Exa/Tavily/Valyu
- `keywordSearchTerms` — 5-15 specific keyword phrases for keyword-based providers
- `industryNaicsMapping` — NAICS codes for Apollo's structured API
- `naturalLanguageDescription` — human-readable ICP summary

These hints are stored on the ICP record and consumed downstream by `ListBuilder` and `DynamicOrchestrator` for improved company matching.

### Auto-Persona Generation

When transcripts or CRM data reveal buyer personas, the parser suggests:
- `titlePatterns` (wildcard patterns like "VP of *")
- `seniorityLevels` (c_suite, vp, director, manager, senior, entry)
- `departments` (functional areas)
- Persona is inserted with `isAutoGenerated=true`

### API Flow

**Incremental:** Add sources one at a time (document upload, transcript paste, CSV upload, classic selectors) → preview each → `POST parse-sources` to synthesize all at once.

**Single-shot:** `POST /build` with multipart form containing all sources and metadata in one call.

---

## Frontend

Next.js 15 App Router at `web/`. Uses shadcn/ui components, TanStack Query for data fetching, TanStack Table for data grids, Zustand for client state.

### Pages
- `/` — Dashboard
- `/clients` — Client list, `/clients/[id]` — client detail
- `/enrichment` — Enrichment trigger UI
- `/icps/[id]` — ICP detail
- `/jobs` — Job monitor
- `/lists` — List index, `/lists/[id]` — list detail + members
- `/settings` — Settings

### Architecture
- `src/lib/api-client.ts` — fetch wrapper for backend API
- `src/lib/api/*.ts` — per-resource API call modules (clients, credits, enrichment, exports, icps, jobs, lists, personas)
- `src/lib/hooks/*.ts` — React Query hooks wrapping API calls
- `src/components/ui/` — shadcn/ui primitives
- `src/components/shared/` — reusable components (data-table, stat-card, confirm-dialog, etc.)

---

## Configuration

Environment variables validated by Zod at startup (`src/config/index.ts`):

| Variable | Required | Notes |
|----------|----------|-------|
| DATABASE_URL | yes | PostgreSQL connection string |
| API_PORT | no | Default 3000 |
| API_KEY | yes | Auth key for all routes |
| ANTHROPIC_API_KEY | yes | Claude SDK for ICP parsing, strategy, signals, profiles |
| APOLLO_API_KEY | yes | Provider 1 |
| LEADMAGIC_API_KEY | yes | Provider 2 |
| PROSPEO_API_KEY | yes | Provider 3 |
| EXA_API_KEY | optional | Provider 4 |
| TAVILY_API_KEY | optional | Provider 5 |
| APIFY_API_KEY | optional | Provider 6 |
| PARALLEL_API_KEY | optional | Provider 7 |
| VALYU_API_KEY | optional | Provider 8 |
| DIFFBOT_API_KEY | optional | Provider 9 |
| BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID | optional | Provider 10 (both required) |
| AGENTQL_API_KEY | optional | Provider 11 |
| FIRECRAWL_API_KEY | optional | Provider 12 |
| SCRAPEGRAPH_API_KEY | optional | Provider 13 |
| GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL | optional | Google Sheets export |
| GOOGLE_SHEETS_PRIVATE_KEY | optional | Google Sheets export |
| NODE_ENV | no | Default development |
| LOG_LEVEL | no | Default info |

---

## Key Interfaces & Types

### Provider Types (`src/providers/types.ts`)

```typescript
interface UnifiedCompany {
  name: string; domain?: string; linkedinUrl?: string; websiteUrl?: string;
  industry?: string; subIndustry?: string; employeeCount?: number; employeeRange?: string;
  annualRevenue?: number; revenueRange?: string; foundedYear?: number;
  totalFunding?: number; latestFundingStage?: string; latestFundingDate?: string;
  city?: string; state?: string; country?: string; address?: string;
  techStack?: string[]; logoUrl?: string; description?: string; phone?: string;
  externalIds: Record<string, string>;
}

interface UnifiedContact {
  firstName?: string; lastName?: string; fullName?: string;
  linkedinUrl?: string; photoUrl?: string; title?: string;
  seniority?: string; department?: string;
  companyName?: string; companyDomain?: string;
  workEmail?: string; personalEmail?: string; phone?: string; mobilePhone?: string;
  city?: string; state?: string; country?: string;
  employmentHistory?: Array<{ company; title; startDate?; endDate?; isCurrent }>;
  externalIds: Record<string, string>;
}

interface CompanySearchParams {
  industries?: string[]; employeeCountMin?: number; employeeCountMax?: number;
  countries?: string[]; keywords?: string[]; limit?: number; offset?: number;
}

interface PeopleSearchParams {
  titlePatterns?: string[]; seniorityLevels?: string[]; departments?: string[];
  companyDomains?: string[]; companyNames?: string[]; countries?: string[];
  limit?: number; offset?: number;
}

interface DataProvider {
  readonly name: string; readonly displayName: string; readonly capabilities: ProviderCapability[];
  searchCompanies?(params): Promise<PaginatedResponse<UnifiedCompany>>;
  enrichCompany?(params): Promise<ProviderResponse<UnifiedCompany>>;
  searchPeople?(params): Promise<PaginatedResponse<UnifiedContact>>;
  enrichPerson?(params): Promise<ProviderResponse<UnifiedContact>>;
  findEmail?(params): Promise<ProviderResponse<{ email; confidence }>>;
  verifyEmail?(params): Promise<ProviderResponse<EmailVerificationResult>>;
  healthCheck(): Promise<boolean>;
}
```

### ICP Types (`src/db/schema/icps.ts`)

```typescript
interface IcpFilters {
  industries?: string[]; employeeCountMin?: number; employeeCountMax?: number;
  revenueMin?: number; revenueMax?: number; fundingStages?: string[];
  fundingMin?: number; fundingMax?: number; foundedAfter?: number; foundedBefore?: number;
  countries?: string[]; states?: string[]; cities?: string[]; excludeCountries?: string[];
  techStack?: string[]; techCategories?: string[]; signals?: string[]; keywords?: string[];
  excludeCompanyIds?: string[]; excludeDomains?: string[];
  providerHints?: ProviderSearchHints;
}

interface ProviderSearchHints {
  semanticSearchQuery?: string;     // for Exa, Tavily, Valyu
  keywordSearchTerms?: string[];    // 5-15 specific terms
  industryNaicsMapping?: string[];  // NAICS codes for Apollo
  naturalLanguageDescription?: string;
}
```

### Intelligence Types (`src/db/schema/intelligence.ts`)

```typescript
interface StrategyData {
  providerPlan: Array<{ provider: string; priority: number; reason: string }>;
  signalPriorities: Array<{ signalType: string; weight: number }>;
  scoringWeights: { icpFit: number; signals: number; originality: number; costEfficiency: number };
  originalityWeight: number;
  maxBudgetPerCompany: number;
  reasoning: string;
}
```

### ServiceContainer (`src/index.ts`)

```typescript
interface ServiceContainer {
  creditManager: CreditManager;
  orchestrator: SourceOrchestrator;
  enrichmentPipeline: EnrichmentPipeline;
  listBuilder: ListBuilder;
  exportEngine: ExportEngine;
  icpParser: IcpParser;
  sourceProcessor: SourceProcessor;
  scheduler: Scheduler;
  performanceTracker: ProviderPerformanceTracker;
  clientProfileService: ClientProfileService;
  signalDetector: SignalDetector;
  intelligenceScorer: IntelligenceScorer;
  strategyGenerator: StrategyGenerator;
  dynamicOrchestrator: DynamicOrchestrator;
}
```

---

## Startup Flow

1. Initialize PostgreSQL connection (`initDb`)
2. Create `CreditManager` and `SourceOrchestrator`
3. Register 13 providers in priority order (optional providers only if API key is set)
4. Create `EnrichmentPipeline`, `ListBuilder`, `ExportEngine`, `IcpParser`, `DocumentExtractor`, `SourceProcessor`, `Scheduler`
5. Create intelligence layer services: `ProviderPerformanceTracker` → `ClientProfileService` → `SignalDetector` → `IntelligenceScorer` → `StrategyGenerator` → `DynamicOrchestrator`
6. Wire performance tracker into orchestrator via `setPerformanceTracker()`
7. Store all in `ServiceContainer` singleton
8. Start pg-boss scheduler with handlers for list-refresh, enrichment, export
9. Build Fastify app (cors, multipart, auth, error handler, all route plugins)
10. Listen on `0.0.0.0:${API_PORT}`
11. Graceful shutdown on SIGTERM/SIGINT

---

## Scripts & Tooling

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `tsx watch src/index.ts` | Dev server with hot reload |
| `build` | `tsc` | TypeScript compilation |
| `start` | `node dist/index.js` | Production start |
| `db:generate` | `drizzle-kit generate` | Generate migrations from schema |
| `db:migrate` | `drizzle-kit migrate` | Run migrations |
| `db:push` | `drizzle-kit push` | Push schema directly (dev) |
| `db:studio` | `drizzle-kit studio` | Drizzle Studio GUI |
| `test` | `vitest` | Run tests (watch mode) |
| `test:run` | `vitest run` | Run tests once |
| `typecheck` | `tsc --noEmit` | Type check without emit |

**Drizzle config** (`drizzle.config.ts`): schema at `./src/db/schema/index.ts`, migrations output to `./drizzle/`, PostgreSQL dialect.

**No tests exist yet.** Vitest is configured but the test suite is empty.
