import { getDb, schema } from '../../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { UptimeRobotProvider } from '../../providers/uptimerobot/index.js';

export interface DowntimeCheckResult {
  competitorsChecked: number;
  activeDowntimes: number;
  resolvedDowntimes: number;
  newAlerts: Array<{ competitorName: string; downtimeStartedAt: string }>;
}

export class CompetitorMonitorService {
  private uptimeRobot: UptimeRobotProvider;
  private log = logger.child({ service: 'competitor-monitor' });

  constructor(uptimeRobotProvider: UptimeRobotProvider) {
    this.uptimeRobot = uptimeRobotProvider;
  }

  /**
   * Add a competitor URL to monitor. Creates an UptimeRobot monitor and stores the record.
   */
  async addCompetitor(params: { clientId: string; name: string; url: string }): Promise<{ id: string }> {
    const db = getDb();

    let uptimerobotMonitorId: string | undefined;
    try {
      const { monitorId } = await this.uptimeRobot.newMonitor(params.url, `[${params.clientId.slice(0, 8)}] ${params.name}`);
      uptimerobotMonitorId = monitorId;
    } catch (err) {
      this.log.warn({ err, url: params.url }, 'Failed to create UptimeRobot monitor — storing competitor without monitoring');
    }

    const [competitor] = await db
      .insert(schema.monitoredCompetitors)
      .values({
        clientId: params.clientId,
        name: params.name,
        url: params.url,
        uptimerobotMonitorId,
      })
      .returning({ id: schema.monitoredCompetitors.id });

    this.log.info({ competitorId: competitor.id, name: params.name, url: params.url }, 'Competitor added');
    return competitor;
  }

  /**
   * Remove a competitor and its UptimeRobot monitor.
   */
  async removeCompetitor(competitorId: string): Promise<void> {
    const db = getDb();

    const [competitor] = await db
      .select()
      .from(schema.monitoredCompetitors)
      .where(eq(schema.monitoredCompetitors.id, competitorId))
      .limit(1);

    if (!competitor) throw new Error(`Competitor not found: ${competitorId}`);

    if (competitor.uptimerobotMonitorId) {
      try {
        await this.uptimeRobot.deleteMonitor(competitor.uptimerobotMonitorId);
      } catch (err) {
        this.log.warn({ err, monitorId: competitor.uptimerobotMonitorId }, 'Failed to delete UptimeRobot monitor');
      }
    }

    await db.delete(schema.monitoredCompetitors).where(eq(schema.monitoredCompetitors.id, competitorId));
    this.log.info({ competitorId }, 'Competitor removed');
  }

  /**
   * Poll UptimeRobot for all active competitors, create/resolve downtime alerts.
   */
  async checkDowntime(clientId: string): Promise<DowntimeCheckResult> {
    const db = getDb();
    const result: DowntimeCheckResult = { competitorsChecked: 0, activeDowntimes: 0, resolvedDowntimes: 0, newAlerts: [] };

    const competitors = await db
      .select()
      .from(schema.monitoredCompetitors)
      .where(and(
        eq(schema.monitoredCompetitors.clientId, clientId),
        eq(schema.monitoredCompetitors.isActive, true),
      ));

    if (competitors.length === 0) {
      this.log.info({ clientId }, 'No active competitors to check');
      return result;
    }

    // Only fetch monitors that have been registered with UptimeRobot
    const monitoredOnes = competitors.filter(c => c.uptimerobotMonitorId);
    const monitorIds = monitoredOnes.map(c => c.uptimerobotMonitorId!);
    result.competitorsChecked = monitoredOnes.length;

    if (monitorIds.length === 0) {
      this.log.info({ clientId }, 'No competitors have UptimeRobot monitors configured');
      return result;
    }

    let monitors;
    try {
      monitors = await this.uptimeRobot.getMonitors(monitorIds);
    } catch (err) {
      this.log.error({ err }, 'Failed to fetch monitors from UptimeRobot');
      throw err;
    }

    const monitorMap = new Map(monitors.map(m => [String(m.id), m]));

    for (const competitor of monitoredOnes) {
      const monitor = monitorMap.get(competitor.uptimerobotMonitorId!);
      if (!monitor) continue;

      const isDown = monitor.status === 8 || monitor.status === 9;

      // Find any existing open alert for this competitor
      const [openAlert] = await db
        .select()
        .from(schema.competitorDowntimeAlerts)
        .where(and(
          eq(schema.competitorDowntimeAlerts.competitorId, competitor.id),
          eq(schema.competitorDowntimeAlerts.status, 'ongoing'),
        ))
        .limit(1);

      if (isDown && !openAlert) {
        // New downtime — create alert
        const downtimeStartedAt = monitor.logs?.[0]?.datetime
          ? new Date(monitor.logs[0].datetime * 1000)
          : new Date();

        await db.insert(schema.competitorDowntimeAlerts).values({
          clientId,
          competitorId: competitor.id,
          competitorName: competitor.name,
          downtimeStartedAt,
          status: 'ongoing',
          alertData: { monitorStatus: monitor.status, monitorUrl: monitor.url, log: monitor.logs?.[0] },
        });

        result.activeDowntimes++;
        result.newAlerts.push({ competitorName: competitor.name, downtimeStartedAt: downtimeStartedAt.toISOString() });
        this.log.warn({ competitorName: competitor.name, status: monitor.status }, 'Competitor downtime detected');
      } else if (!isDown && openAlert) {
        // Back online — resolve alert
        const now = new Date();
        const durationMinutes = Math.floor((now.getTime() - openAlert.downtimeStartedAt.getTime()) / 60000);

        await db.update(schema.competitorDowntimeAlerts)
          .set({
            status: 'resolved',
            downtimeResolvedAt: now,
            durationMinutes,
            updatedAt: now,
          })
          .where(eq(schema.competitorDowntimeAlerts.id, openAlert.id));

        result.resolvedDowntimes++;
        this.log.info({ competitorName: competitor.name, durationMinutes }, 'Competitor downtime resolved');
      } else if (isDown && openAlert) {
        result.activeDowntimes++;
      }
    }

    this.log.info(result, 'Downtime check complete');
    return result;
  }

  /**
   * Get all downtime alerts for a client.
   */
  async getAlerts(params: { clientId: string; status?: string; includeDismissed?: boolean }): Promise<typeof schema.competitorDowntimeAlerts.$inferSelect[]> {
    const db = getDb();
    const conditions = [eq(schema.competitorDowntimeAlerts.clientId, params.clientId)];

    if (params.status) {
      conditions.push(eq(schema.competitorDowntimeAlerts.status, params.status));
    }
    if (!params.includeDismissed) {
      conditions.push(eq(schema.competitorDowntimeAlerts.dismissed, false));
    }

    return db
      .select()
      .from(schema.competitorDowntimeAlerts)
      .where(and(...conditions))
      .orderBy(schema.competitorDowntimeAlerts.createdAt);
  }

  /**
   * Dismiss an alert.
   */
  async dismissAlert(alertId: string): Promise<void> {
    const db = getDb();
    await db
      .update(schema.competitorDowntimeAlerts)
      .set({ dismissed: true, updatedAt: new Date() })
      .where(eq(schema.competitorDowntimeAlerts.id, alertId));
  }
}
