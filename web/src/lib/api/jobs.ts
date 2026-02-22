import { apiClient } from '../api-client';
import type { Job, ApiResponse } from '../types';

export async function getJobs(params?: {
  clientId?: string;
  status?: string;
  limit?: number;
}): Promise<Job[]> {
  const query = new URLSearchParams();
  if (params?.clientId) query.set('clientId', params.clientId);
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient.get<ApiResponse<Job[]>>(`/api/jobs${qs}`);
  return res.data;
}

export async function getJob(id: string): Promise<Job> {
  const res = await apiClient.get<ApiResponse<Job>>(`/api/jobs/${id}`);
  return res.data;
}

export async function cancelJob(id: string): Promise<Job> {
  const res = await apiClient.post<ApiResponse<Job>>(`/api/jobs/${id}/cancel`);
  return res.data;
}
