import PgBoss from 'pg-boss';
import { getDb, schema } from '../../db/index.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const JOB_TYPES = {
  LIST_REFRESH: 'list-refresh',
  ENRICHMENT: 'enrichment',
  EXPORT: 'export',
} as const;

export class Scheduler {
  private boss: PgBoss;

  constructor(connectionString: string) {
    this.boss = new PgBoss({
      connectionString,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      expireInHours: 24,
      archiveCompletedAfterSeconds: 7 * 24 * 3600,
    });
  }

  async start(handlers: {
    onListRefresh: (data: { listId: string; clientId: string }) => Promise<void>;
    onEnrichment: (data: { clientId: string; domains: string[]; jobId: string; options?: Record<string, unknown> }) => Promise<void>;
    onExport: (data: { clientId: string; listId: string; format: string; destination?: Record<string, unknown> }) => Promise<void>;
  }): Promise<void> {
    await this.boss.start();

    await this.boss.work(JOB_TYPES.LIST_REFRESH, async (jobs: PgBoss.Job[]) => {
      for (const job of jobs) {
        logger.info({ jobId: job.id, data: job.data }, 'Processing list refresh');
        await handlers.onListRefresh(job.data as { listId: string; clientId: string });
      }
    });

    await this.boss.work(JOB_TYPES.ENRICHMENT, async (jobs: PgBoss.Job[]) => {
      for (const job of jobs) {
        logger.info({ jobId: job.id }, 'Processing enrichment');
        await handlers.onEnrichment(job.data as { clientId: string; domains: string[]; jobId: string; options?: Record<string, unknown> });
      }
    });

    await this.boss.work(JOB_TYPES.EXPORT, async (jobs: PgBoss.Job[]) => {
      for (const job of jobs) {
        logger.info({ jobId: job.id }, 'Processing export');
        await handlers.onExport(job.data as { clientId: string; listId: string; format: string; destination?: Record<string, unknown> });
      }
    });

    await this.registerListRefreshSchedules();
    logger.info('Scheduler started');
  }

  async registerListRefreshSchedules(): Promise<void> {
    const db = getDb();
    const refreshableLists = await db
      .select()
      .from(schema.lists)
      .where(
        and(
          eq(schema.lists.refreshEnabled, true),
          eq(schema.lists.isActive, true),
          isNotNull(schema.lists.refreshCron),
        ),
      );

    for (const list of refreshableLists) {
      if (!list.refreshCron) continue;
      const scheduleName = `list-refresh-${list.id}`;
      await this.boss.schedule(scheduleName, list.refreshCron, {
        listId: list.id,
        clientId: list.clientId,
      });
      logger.info({ listId: list.id, cron: list.refreshCron }, 'Registered refresh schedule');
    }
  }

  async enqueue(type: string, data: Record<string, unknown>, options?: { priority?: number }): Promise<string> {
    const jobId = await this.boss.send(type, data, {
      priority: options?.priority ?? 0,
    });
    return jobId!;
  }

  async updateListSchedule(listId: string, cron: string | null): Promise<void> {
    const scheduleName = `list-refresh-${listId}`;
    await this.boss.unschedule(scheduleName);
    if (cron) {
      const db = getDb();
      const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, listId)).limit(1);
      if (list) {
        await this.boss.schedule(scheduleName, cron, {
          listId: list.id,
          clientId: list.clientId,
        });
      }
    }
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }
}
