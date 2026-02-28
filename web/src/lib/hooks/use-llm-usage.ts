import { useQuery } from '@tanstack/react-query';
import * as llmUsageApi from '../api/llm-usage';

export const llmUsageKeys = {
  summary: (clientId?: string, days?: number) => ['llm-usage', 'summary', clientId, days] as const,
  byJob: (jobId: string) => ['llm-usage', 'by-job', jobId] as const,
  recent: (clientId?: string, limit?: number) => ['llm-usage', 'recent', clientId, limit] as const,
  providerSummary: (clientId?: string, days?: number) => ['provider-costs', 'summary', clientId, days] as const,
};

export function useLlmUsageSummary(params?: { clientId?: string; days?: number }) {
  return useQuery({
    queryKey: llmUsageKeys.summary(params?.clientId, params?.days),
    queryFn: () => llmUsageApi.getLlmUsageSummary(params),
    staleTime: 30 * 1000,
  });
}

export function useLlmUsageByJob(jobId: string | null) {
  return useQuery({
    queryKey: llmUsageKeys.byJob(jobId!),
    queryFn: () => llmUsageApi.getLlmUsageByJob(jobId!),
    enabled: !!jobId,
    staleTime: 30 * 1000,
  });
}

export function useProviderCostSummary(params?: { clientId?: string; days?: number }) {
  return useQuery({
    queryKey: llmUsageKeys.providerSummary(params?.clientId, params?.days),
    queryFn: () => llmUsageApi.getProviderCostSummary(params),
    staleTime: 30 * 1000,
  });
}

export function useLlmUsageRecent(params?: { clientId?: string; limit?: number }) {
  return useQuery({
    queryKey: llmUsageKeys.recent(params?.clientId, params?.limit),
    queryFn: () => llmUsageApi.getLlmUsageRecent(params),
    staleTime: 30 * 1000,
  });
}
