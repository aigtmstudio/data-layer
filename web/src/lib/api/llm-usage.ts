import { apiClient } from '../api-client';
import type { LlmUsageSummary, LlmUsageRecord, ProviderCostSummary, ApiResponse } from '../types';

export async function getLlmUsageSummary(params?: {
  clientId?: string;
  days?: number;
}): Promise<LlmUsageSummary> {
  const searchParams = new URLSearchParams();
  if (params?.clientId) searchParams.set('clientId', params.clientId);
  if (params?.days) searchParams.set('days', String(params.days));
  const qs = searchParams.toString();
  const res = await apiClient.get<ApiResponse<LlmUsageSummary>>(
    `/api/llm-usage/summary${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}

export async function getLlmUsageByJob(jobId: string): Promise<{
  records: LlmUsageRecord[];
  totals: LlmUsageSummary['totals'];
}> {
  const res = await apiClient.get<ApiResponse<{
    records: LlmUsageRecord[];
    totals: LlmUsageSummary['totals'];
  }>>(`/api/llm-usage/by-job/${jobId}`);
  return res.data;
}

export async function getProviderCostSummary(params?: {
  clientId?: string;
  days?: number;
}): Promise<ProviderCostSummary> {
  const searchParams = new URLSearchParams();
  if (params?.clientId) searchParams.set('clientId', params.clientId);
  if (params?.days) searchParams.set('days', String(params.days));
  const qs = searchParams.toString();
  const res = await apiClient.get<ApiResponse<ProviderCostSummary>>(
    `/api/llm-usage/provider-summary${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}

export async function getLlmUsageRecent(params?: {
  limit?: number;
  clientId?: string;
}): Promise<LlmUsageRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.clientId) searchParams.set('clientId', params.clientId);
  const qs = searchParams.toString();
  const res = await apiClient.get<ApiResponse<LlmUsageRecord[]>>(
    `/api/llm-usage/recent${qs ? `?${qs}` : ''}`,
  );
  return res.data;
}
