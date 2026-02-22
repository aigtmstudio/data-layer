import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as jobsApi from '../api/jobs';

export const jobKeys = {
  all: (params?: { clientId?: string; status?: string }) => ['jobs', params] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
};

export function useJobs(params?: { clientId?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: jobKeys.all(params),
    queryFn: () => jobsApi.getJobs(params),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: jobKeys.detail(id!),
    queryFn: () => jobsApi.getJob(id!),
    enabled: !!id,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.cancelJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
