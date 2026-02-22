import { getDb, schema } from '../../db/index.js';
import { eq, and, gte, avg, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export interface PerformanceRecord {
  providerName: string;
  clientId: string;
  operation: string;
  qualityScore: number;
  responseTimeMs: number;
  fieldsPopulated: number;
  costCredits: number;
}

export interface ProviderStats {
  providerName: string;
  avgQualityScore: number;
  avgResponseTimeMs: number;
  avgFieldsPopulated: number;
  avgCostCredits: number;
  totalCalls: number;
}

export class ProviderPerformanceTracker {
  async recordPerformance(record: PerformanceRecord): Promise<void> {
    try {
      const db = getDb();
      await db.insert(schema.providerPerformance).values({
        providerName: record.providerName,
        clientId: record.clientId,
        operation: record.operation,
        qualityScore: String(record.qualityScore),
        responseTimeMs: record.responseTimeMs,
        fieldsPopulated: record.fieldsPopulated,
        costCredits: String(record.costCredits),
      });
    } catch (error) {
      // Non-critical — don't let tracking failures break enrichment
      logger.warn({ error, record: record.providerName }, 'Failed to record provider performance');
    }
  }

  async getProviderStats(
    clientId: string,
    lookbackDays = 30,
  ): Promise<ProviderStats[]> {
    const db = getDb();
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const results = await db
      .select({
        providerName: schema.providerPerformance.providerName,
        avgQualityScore: avg(schema.providerPerformance.qualityScore),
        avgResponseTimeMs: avg(schema.providerPerformance.responseTimeMs),
        avgFieldsPopulated: avg(schema.providerPerformance.fieldsPopulated),
        avgCostCredits: avg(schema.providerPerformance.costCredits),
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(schema.providerPerformance)
      .where(and(
        eq(schema.providerPerformance.clientId, clientId),
        gte(schema.providerPerformance.createdAt, since),
      ))
      .groupBy(schema.providerPerformance.providerName);

    return results.map(r => ({
      providerName: r.providerName,
      avgQualityScore: Number(r.avgQualityScore) || 0,
      avgResponseTimeMs: Number(r.avgResponseTimeMs) || 0,
      avgFieldsPopulated: Number(r.avgFieldsPopulated) || 0,
      avgCostCredits: Number(r.avgCostCredits) || 0,
      totalCalls: r.totalCalls,
    }));
  }

  async getProviderStatsForOperation(
    clientId: string,
    operation: string,
    lookbackDays = 30,
  ): Promise<ProviderStats[]> {
    const db = getDb();
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const results = await db
      .select({
        providerName: schema.providerPerformance.providerName,
        avgQualityScore: avg(schema.providerPerformance.qualityScore),
        avgResponseTimeMs: avg(schema.providerPerformance.responseTimeMs),
        avgFieldsPopulated: avg(schema.providerPerformance.fieldsPopulated),
        avgCostCredits: avg(schema.providerPerformance.costCredits),
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(schema.providerPerformance)
      .where(and(
        eq(schema.providerPerformance.clientId, clientId),
        eq(schema.providerPerformance.operation, operation),
        gte(schema.providerPerformance.createdAt, since),
      ))
      .groupBy(schema.providerPerformance.providerName);

    return results.map(r => ({
      providerName: r.providerName,
      avgQualityScore: Number(r.avgQualityScore) || 0,
      avgResponseTimeMs: Number(r.avgResponseTimeMs) || 0,
      avgFieldsPopulated: Number(r.avgFieldsPopulated) || 0,
      avgCostCredits: Number(r.avgCostCredits) || 0,
      totalCalls: r.totalCalls,
    }));
  }
}
