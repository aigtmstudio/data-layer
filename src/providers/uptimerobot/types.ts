export interface UptimeRobotMonitor {
  id: string;
  friendly_name: string;
  url: string;
  /** 0=paused, 1=not checked yet, 2=up, 8=seems down, 9=down */
  status: 0 | 1 | 2 | 8 | 9;
  type: number;
  create_datetime: number;
  /** latest downtime event if currently down */
  logs?: UptimeRobotLog[];
}

export interface UptimeRobotLog {
  type: number; // 1=down, 2=up
  datetime: number;
  duration: number;
  reason?: { code: number; detail: string };
}

export interface UptimeRobotGetMonitorsResponse {
  stat: 'ok' | 'fail';
  pagination?: { offset: number; limit: number; total: number };
  monitors?: UptimeRobotMonitor[];
  error?: { type: string; message: string };
}

export interface UptimeRobotNewMonitorResponse {
  stat: 'ok' | 'fail';
  monitor?: { id: number };
  error?: { type: string; message: string };
}

export interface UptimeRobotDeleteMonitorResponse {
  stat: 'ok' | 'fail';
  monitor?: { id: number };
  error?: { type: string; message: string };
}
