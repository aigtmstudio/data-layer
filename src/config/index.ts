import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().optional(),
  API_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),

  APOLLO_API_KEY: z.string().min(1),
  LEADMAGIC_API_KEY: z.string().min(1),
  PROSPEO_API_KEY: z.string().min(1),

  EXA_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  APIFY_API_KEY: z.string().optional(),
  PARALLEL_API_KEY: z.string().optional(),
  VALYU_API_KEY: z.string().optional(),
  DIFFBOT_API_KEY: z.string().optional(),
  BROWSERBASE_API_KEY: z.string().optional(),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  AGENTQL_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  SCRAPEGRAPH_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),

  UPTIMEROBOT_API_KEY: z.string().optional(),

  // Auth (Clerk)
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().optional(),

  // Demo endpoints
  DEMO_CLIENT_ID: z.string().uuid().optional(),
  DEMO_DAILY_LIMIT: z.coerce.number().default(100),
  DEMO_CREDIT_BYPASS: z.string().transform(v => v === 'true').default('false'),

  GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  apiPort: parsed.data.API_PORT ?? parsed.data.PORT ?? 3000,
  apiKey: parsed.data.API_KEY,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
  apolloApiKey: parsed.data.APOLLO_API_KEY,
  leadmagicApiKey: parsed.data.LEADMAGIC_API_KEY,
  prospeoApiKey: parsed.data.PROSPEO_API_KEY,
  exaApiKey: parsed.data.EXA_API_KEY,
  tavilyApiKey: parsed.data.TAVILY_API_KEY,
  apifyApiKey: parsed.data.APIFY_API_KEY,
  parallelApiKey: parsed.data.PARALLEL_API_KEY,
  valyuApiKey: parsed.data.VALYU_API_KEY,
  diffbotApiKey: parsed.data.DIFFBOT_API_KEY,
  browserbaseApiKey: parsed.data.BROWSERBASE_API_KEY,
  browserbaseProjectId: parsed.data.BROWSERBASE_PROJECT_ID,
  agentqlApiKey: parsed.data.AGENTQL_API_KEY,
  firecrawlApiKey: parsed.data.FIRECRAWL_API_KEY,
  scrapegraphApiKey: parsed.data.SCRAPEGRAPH_API_KEY,
  jinaApiKey: parsed.data.JINA_API_KEY,
  uptimerobotApiKey: parsed.data.UPTIMEROBOT_API_KEY,
  clerkSecretKey: parsed.data.CLERK_SECRET_KEY,
  clerkPublishableKey: parsed.data.CLERK_PUBLISHABLE_KEY,
  corsOrigin: parsed.data.CORS_ORIGIN,
  demoClientId: parsed.data.DEMO_CLIENT_ID,
  demoDailyLimit: parsed.data.DEMO_DAILY_LIMIT,
  demoCreditBypass: parsed.data.DEMO_CREDIT_BYPASS,
  googleSheets: {
    email: parsed.data.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
    privateKey: parsed.data.GOOGLE_SHEETS_PRIVATE_KEY,
  },
  nodeEnv: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
} as const;
