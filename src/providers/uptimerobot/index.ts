import { logger } from '../../lib/logger.js';
import type {
  UptimeRobotMonitor,
  UptimeRobotGetMonitorsResponse,
  UptimeRobotNewMonitorResponse,
  UptimeRobotDeleteMonitorResponse,
} from './types.js';

const BASE_URL = 'https://api.uptimerobot.com/v2';

// Monitor type 1 = HTTP(S)
const HTTP_MONITOR_TYPE = 1;

export { UptimeRobotMonitor };

export class UptimeRobotProvider {
  private apiKey: string;
  private log = logger.child({ provider: 'uptimerobot' });

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async post<T>(endpoint: string, body: Record<string, string | number | boolean>): Promise<T> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      format: 'json',
      ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])),
    });

    const response = await fetch(`${BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`UptimeRobot API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a new HTTP(S) monitor.
   */
  async newMonitor(url: string, friendlyName: string): Promise<{ monitorId: string }> {
    const result = await this.post<UptimeRobotNewMonitorResponse>('newMonitor', {
      friendly_name: friendlyName,
      url,
      type: HTTP_MONITOR_TYPE,
    });

    if (result.stat !== 'ok' || !result.monitor) {
      throw new Error(`Failed to create monitor: ${result.error?.message ?? 'unknown error'}`);
    }

    this.log.info({ monitorId: result.monitor.id, url, friendlyName }, 'Monitor created');
    return { monitorId: String(result.monitor.id) };
  }

  /**
   * Get monitor status. If monitorIds provided, fetches only those monitors.
   */
  async getMonitors(monitorIds?: string[]): Promise<UptimeRobotMonitor[]> {
    const body: Record<string, string | number | boolean> = {
      logs: 1,
      log_types: '1-2',
      logs_limit: 1,
    };

    if (monitorIds?.length) {
      body['monitors'] = monitorIds.join('-');
    }

    const result = await this.post<UptimeRobotGetMonitorsResponse>('getMonitors', body);

    if (result.stat !== 'ok') {
      throw new Error(`Failed to get monitors: ${result.error?.message ?? 'unknown error'}`);
    }

    return result.monitors ?? [];
  }

  /**
   * Delete a monitor by ID.
   */
  async deleteMonitor(monitorId: string): Promise<void> {
    const result = await this.post<UptimeRobotDeleteMonitorResponse>('deleteMonitor', {
      id: monitorId,
    });

    if (result.stat !== 'ok') {
      throw new Error(`Failed to delete monitor: ${result.error?.message ?? 'unknown error'}`);
    }

    this.log.info({ monitorId }, 'Monitor deleted');
  }
}
