import type { FastifyPluginAsync } from 'fastify';
import { getDb, schema } from '../../db/index.js';
import { eq, and, desc, sql, gte, inArray } from 'drizzle-orm';

export const llmUsageRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/llm-usage/summary?clientId=X&days=30
  app.get<{ Querystring: { clientId?: string; days?: string } }>(
    '/summary',
    async (request) => {
      const db = getDb();
      const days = parseInt(request.query.days ?? '30', 10);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const conditions = [gte(schema.llmUsage.createdAt, since)];
      if (request.query.clientId) {
        conditions.push(eq(schema.llmUsage.clientId, request.query.clientId));
      }

      const [totals] = await db
        .select({
          totalCalls: sql<number>`count(*)::int`,
          totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)::int`,
          totalCostUsd: sql<string>`coalesce(sum(${schema.llmUsage.totalCostUsd}), 0)::text`,
        })
        .from(schema.llmUsage)
        .where(and(...conditions));

      const byService = await db
        .select({
          service: schema.llmUsage.service,
          model: schema.llmUsage.model,
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`sum(${schema.llmUsage.inputTokens})::int`,
          outputTokens: sql<number>`sum(${schema.llmUsage.outputTokens})::int`,
          costUsd: sql<string>`sum(${schema.llmUsage.totalCostUsd})::text`,
        })
        .from(schema.llmUsage)
        .where(and(...conditions))
        .groupBy(schema.llmUsage.service, schema.llmUsage.model)
        .orderBy(sql`sum(${schema.llmUsage.totalCostUsd}) desc`);

      return { data: { totals, byService, periodDays: days } };
    },
  );

  // GET /api/llm-usage/by-job/:jobId
  app.get<{ Params: { jobId: string } }>('/by-job/:jobId', async (request) => {
    const db = getDb();
    const records = await db
      .select()
      .from(schema.llmUsage)
      .where(eq(schema.llmUsage.jobId, request.params.jobId))
      .orderBy(schema.llmUsage.createdAt);

    const [totals] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalInputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}), 0)::int`,
        totalCostUsd: sql<string>`coalesce(sum(${schema.llmUsage.totalCostUsd}), 0)::text`,
      })
      .from(schema.llmUsage)
      .where(eq(schema.llmUsage.jobId, request.params.jobId));

    return { data: { records, totals } };
  });

  // GET /api/llm-usage/provider-summary?clientId=X&days=30
  app.get<{ Querystring: { clientId?: string; days?: string } }>(
    '/provider-summary',
    async (request) => {
      const db = getDb();
      const days = parseInt(request.query.days ?? '30', 10);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const conditions = [
        gte(schema.creditTransactions.createdAt, since),
        eq(schema.creditTransactions.type, 'usage'),
      ];
      if (request.query.clientId) {
        conditions.push(eq(schema.creditTransactions.clientId, request.query.clientId));
      }

      const [totals] = await db
        .select({
          totalCalls: sql<number>`count(*)::int`,
          totalBaseCost: sql<string>`coalesce(sum(abs(${schema.creditTransactions.baseCost})), 0)::text`,
          totalMargin: sql<string>`coalesce(sum(abs(${schema.creditTransactions.marginAmount})), 0)::text`,
          totalCreditsUsed: sql<string>`coalesce(sum(abs(${schema.creditTransactions.amount})), 0)::text`,
        })
        .from(schema.creditTransactions)
        .where(and(...conditions));

      const byProvider = await db
        .select({
          provider: schema.creditTransactions.dataSource,
          operation: schema.creditTransactions.operationType,
          calls: sql<number>`count(*)::int`,
          baseCost: sql<string>`coalesce(sum(abs(${schema.creditTransactions.baseCost})), 0)::text`,
          margin: sql<string>`coalesce(sum(abs(${schema.creditTransactions.marginAmount})), 0)::text`,
          creditsUsed: sql<string>`coalesce(sum(abs(${schema.creditTransactions.amount})), 0)::text`,
        })
        .from(schema.creditTransactions)
        .where(and(...conditions))
        .groupBy(schema.creditTransactions.dataSource, schema.creditTransactions.operationType)
        .orderBy(sql`sum(abs(${schema.creditTransactions.amount})) desc`);

      const recentUsage = await db
        .select({
          id: schema.creditTransactions.id,
          dataSource: schema.creditTransactions.dataSource,
          operationType: schema.creditTransactions.operationType,
          baseCost: schema.creditTransactions.baseCost,
          marginAmount: schema.creditTransactions.marginAmount,
          amount: schema.creditTransactions.amount,
          description: schema.creditTransactions.description,
          createdAt: schema.creditTransactions.createdAt,
        })
        .from(schema.creditTransactions)
        .where(and(...conditions))
        .orderBy(desc(schema.creditTransactions.createdAt))
        .limit(100);

      return { data: { totals, byProvider, recentUsage, periodDays: days } };
    },
  );

  // GET /api/llm-usage/recent?limit=50&clientId=X
  app.get<{ Querystring: { limit?: string; clientId?: string } }>(
    '/recent',
    async (request) => {
      const db = getDb();
      const limit = parseInt(request.query.limit ?? '50', 10);
      const conditions = [];
      if (request.query.clientId) {
        conditions.push(eq(schema.llmUsage.clientId, request.query.clientId));
      }

      const records = await db
        .select()
        .from(schema.llmUsage)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.llmUsage.createdAt))
        .limit(limit);

      return { data: records };
    },
  );
};
