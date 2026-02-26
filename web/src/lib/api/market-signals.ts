import { apiClient } from '../api-client';
import type { MarketSignal, ApiResponse } from '../types';

export async function getMarketSignals(
  clientId: string,
  filters?: { category?: string; processed?: boolean; hypothesisId?: string; limit?: number; offset?: number },
): Promise<{ signals: MarketSignal[]; total: number }> {
  const query = new URLSearchParams({ clientId });
  if (filters?.category) query.set('category', filters.category);
  if (filters?.processed !== undefined) query.set('processed', String(filters.processed));
  if (filters?.hypothesisId) query.set('hypothesisId', filters.hypothesisId);
  if (filters?.limit) query.set('limit', String(filters.limit));
  if (filters?.offset) query.set('offset', String(filters.offset));
  const res = await apiClient.get<{ data: MarketSignal[]; total: number }>(`/api/market-signals?${query}`);
  return { signals: res.data, total: res.total };
}

export async function getMarketSignal(id: string): Promise<MarketSignal> {
  const res = await apiClient.get<ApiResponse<MarketSignal>>(`/api/market-signals/${id}`);
  return res.data;
}

export async function ingestSignal(data: {
  clientId: string;
  headline: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
}): Promise<MarketSignal> {
  const res = await apiClient.post<ApiResponse<MarketSignal>>('/api/market-signals/ingest', data);
  return res.data;
}

export async function processSignals(data?: {
  clientId?: string;
  batchSize?: number;
}): Promise<void> {
  await apiClient.post('/api/market-signals/process', data ?? {});
}

export async function searchEvidence(data: {
  clientId: string;
  hypothesisIds?: string[];
  maxSearchesPerHypothesis?: number;
}): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string; message: string }>>(
    '/api/market-signals/search-evidence',
    data,
  );
  return res.data;
}
