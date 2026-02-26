import { apiClient } from '../api-client';
import type { SignalHypothesis, SignalLevel, ApiResponse } from '../types';

export async function getHypotheses(
  clientId: string,
  filters?: { status?: string; category?: string; signalLevel?: SignalLevel; icpId?: string },
): Promise<SignalHypothesis[]> {
  const query = new URLSearchParams({ clientId });
  if (filters?.status) query.set('status', filters.status);
  if (filters?.category) query.set('category', filters.category);
  if (filters?.signalLevel) query.set('signalLevel', filters.signalLevel);
  if (filters?.icpId) query.set('icpId', filters.icpId);
  const res = await apiClient.get<ApiResponse<SignalHypothesis[]>>(`/api/hypotheses?${query}`);
  return res.data;
}

export async function getHypothesis(id: string): Promise<SignalHypothesis> {
  const res = await apiClient.get<ApiResponse<SignalHypothesis>>(`/api/hypotheses/${id}`);
  return res.data;
}

export async function createHypothesis(data: {
  clientId: string;
  icpId?: string;
  hypothesis: string;
  signalLevel: SignalLevel;
  signalCategory: string;
  monitoringSources?: string[];
  affectedSegments?: string[];
  priority?: number;
}): Promise<SignalHypothesis> {
  const res = await apiClient.post<ApiResponse<SignalHypothesis>>('/api/hypotheses', data);
  return res.data;
}

export async function generateHypotheses(data: {
  clientId: string;
  icpId?: string;
  signalLevel: SignalLevel;
  personaId?: string;
}): Promise<{ jobId: string; message: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string; message: string }>>('/api/hypotheses/generate', data);
  return res.data;
}

export async function updateHypothesis(
  id: string,
  data: Partial<{
    hypothesis: string;
    signalCategory: string;
    monitoringSources: string[];
    affectedSegments: string[];
    priority: number;
    status: string;
    validatedBy: string;
  }>,
): Promise<SignalHypothesis> {
  const res = await apiClient.patch<ApiResponse<SignalHypothesis>>(`/api/hypotheses/${id}`, data);
  return res.data;
}

export async function bulkUpdateStatus(ids: string[], status: string): Promise<void> {
  await apiClient.patch('/api/hypotheses/bulk-status', { ids, status });
}

export async function deleteHypothesis(id: string): Promise<void> {
  await apiClient.delete(`/api/hypotheses/${id}`);
}
