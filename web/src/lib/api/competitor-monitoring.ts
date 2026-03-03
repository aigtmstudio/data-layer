import { apiClient } from '../api-client';
import type { ApiResponse } from '../types';

export interface MonitoredCompetitor {
  id: string;
  clientId: string;
  name: string;
  url: string;
  uptimerobotMonitorId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorDowntimeAlert {
  id: string;
  clientId: string;
  competitorId: string;
  competitorName: string;
  downtimeStartedAt: string;
  downtimeResolvedAt?: string;
  durationMinutes?: number;
  status: 'ongoing' | 'resolved';
  dismissed: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCompetitors(clientId: string): Promise<MonitoredCompetitor[]> {
  const res = await apiClient.get<ApiResponse<MonitoredCompetitor[]>>(`/api/competitors?clientId=${clientId}`);
  return res.data;
}

export async function addCompetitor(data: { clientId: string; name: string; url: string }): Promise<MonitoredCompetitor> {
  const res = await apiClient.post<ApiResponse<MonitoredCompetitor>>('/api/competitors', data);
  return res.data;
}

export async function removeCompetitor(id: string): Promise<void> {
  await apiClient.delete(`/api/competitors/${id}`);
}

export async function getAlerts(clientId: string, status?: 'ongoing' | 'resolved'): Promise<CompetitorDowntimeAlert[]> {
  const query = new URLSearchParams({ clientId });
  if (status) query.set('status', status);
  const res = await apiClient.get<ApiResponse<CompetitorDowntimeAlert[]>>(`/api/competitors/alerts?${query}`);
  return res.data;
}

export async function dismissAlert(id: string): Promise<void> {
  await apiClient.post(`/api/competitors/alerts/${id}/dismiss`, {});
}

export async function checkDowntime(clientId: string): Promise<{ checked: number; newAlerts: number; resolved: number }> {
  const res = await apiClient.post<ApiResponse<{ checked: number; newAlerts: number; resolved: number }>>('/api/competitors/alerts/check', { clientId });
  return res.data;
}
