import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3000),
  API_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),

  APOLLO_API_KEY: z.string().min(1),
  LEADMAGIC_API_KEY: z.string().min(1),
  PROSPEO_API_KEY: z.string().min(1),

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
  apiPort: parsed.data.API_PORT,
  apiKey: parsed.data.API_KEY,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
  apolloApiKey: parsed.data.APOLLO_API_KEY,
  leadmagicApiKey: parsed.data.LEADMAGIC_API_KEY,
  prospeoApiKey: parsed.data.PROSPEO_API_KEY,
  googleSheets: {
    email: parsed.data.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
    privateKey: parsed.data.GOOGLE_SHEETS_PRIVATE_KEY,
  },
  nodeEnv: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
} as const;
