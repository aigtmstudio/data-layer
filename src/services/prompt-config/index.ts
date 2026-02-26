import { getDb, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface PromptDefinition {
  key: string;
  label: string;
  area: string;
  promptType: 'system' | 'user';
  model: string;
  description: string;
  defaultContent: string;
}

export interface PromptConfig extends PromptDefinition {
  currentContent: string;
  isCustomised: boolean;
  updatedAt: string | null;
}

// ── Default prompt registry ──────────────────────────────────────────

const PROMPT_REGISTRY: PromptDefinition[] = [];

export function registerPrompt(def: PromptDefinition) {
  const existing = PROMPT_REGISTRY.findIndex(p => p.key === def.key);
  if (existing >= 0) {
    PROMPT_REGISTRY[existing] = def;
  } else {
    PROMPT_REGISTRY.push(def);
  }
}

// ── Service ──────────────────────────────────────────────────────────

export class PromptConfigService {
  private cache = new Map<string, string>();
  private cacheLoaded = false;

  /** Load all overrides from DB into memory */
  async loadCache(): Promise<void> {
    const db = getDb();
    const rows = await db.select().from(schema.promptConfigs);
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.key, row.content);
    }
    this.cacheLoaded = true;
    logger.debug({ overrides: rows.length }, 'Prompt config cache loaded');
  }

  /** Get the current content for a prompt key (override or default) */
  async getPrompt(key: string): Promise<string> {
    if (!this.cacheLoaded) await this.loadCache();

    const override = this.cache.get(key);
    if (override !== undefined) return override;

    const def = PROMPT_REGISTRY.find(p => p.key === key);
    if (!def) throw new Error(`Unknown prompt key: ${key}`);
    return def.defaultContent;
  }

  /** List all prompts with their current content + metadata */
  async listAll(): Promise<PromptConfig[]> {
    if (!this.cacheLoaded) await this.loadCache();

    const db = getDb();
    const overrides = await db.select().from(schema.promptConfigs);
    const overrideMap = new Map(overrides.map(o => [o.key, o]));

    return PROMPT_REGISTRY.map(def => {
      const override = overrideMap.get(def.key);
      return {
        ...def,
        currentContent: override?.content ?? def.defaultContent,
        isCustomised: !!override,
        updatedAt: override?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Update a prompt (upsert override) */
  async updatePrompt(key: string, content: string): Promise<PromptConfig> {
    const def = PROMPT_REGISTRY.find(p => p.key === key);
    if (!def) throw new Error(`Unknown prompt key: ${key}`);

    const db = getDb();
    const now = new Date();

    const existing = await db
      .select()
      .from(schema.promptConfigs)
      .where(eq(schema.promptConfigs.key, key));

    if (existing.length > 0) {
      await db
        .update(schema.promptConfigs)
        .set({ content, updatedAt: now })
        .where(eq(schema.promptConfigs.key, key));
    } else {
      await db.insert(schema.promptConfigs).values({ key, content, updatedAt: now });
    }

    this.cache.set(key, content);

    return {
      ...def,
      currentContent: content,
      isCustomised: true,
      updatedAt: now.toISOString(),
    };
  }

  /** Reset a prompt to its default */
  async resetPrompt(key: string): Promise<PromptConfig> {
    const def = PROMPT_REGISTRY.find(p => p.key === key);
    if (!def) throw new Error(`Unknown prompt key: ${key}`);

    const db = getDb();
    await db.delete(schema.promptConfigs).where(eq(schema.promptConfigs.key, key));
    this.cache.delete(key);

    return {
      ...def,
      currentContent: def.defaultContent,
      isCustomised: false,
      updatedAt: null,
    };
  }
}
