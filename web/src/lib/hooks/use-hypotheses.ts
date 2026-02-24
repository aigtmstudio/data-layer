import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useCallback } from 'react';
import * as hypothesesApi from '../api/hypotheses';

export const hypothesisKeys = {
  all: (clientId?: string) => clientId ? ['hypotheses', clientId] as const : ['hypotheses'] as const,
  detail: (id: string) => ['hypotheses', 'detail', id] as const,
};

export function useHypotheses(
  clientId: string | null,
  filters?: { status?: string; category?: string; icpId?: string },
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: [...hypothesisKeys.all(clientId!), filters],
    queryFn: () => hypothesesApi.getHypotheses(clientId!, filters),
    enabled: !!clientId,
    staleTime: 30 * 1000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useHypothesis(id: string | null) {
  return useQuery({
    queryKey: hypothesisKeys.detail(id!),
    queryFn: () => hypothesesApi.getHypothesis(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useGenerateHypotheses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: hypothesesApi.generateHypotheses,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses'] }),
  });
}

export function useCreateHypothesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: hypothesesApi.createHypothesis,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses'] }),
  });
}

export function useUpdateHypothesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof hypothesesApi.updateHypothesis>[1] }) =>
      hypothesesApi.updateHypothesis(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses'] }),
  });
}

export function useBulkUpdateHypothesisStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      hypothesesApi.bulkUpdateStatus(ids, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses'] }),
  });
}

export function useDeleteHypothesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: hypothesesApi.deleteHypothesis,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses'] }),
  });
}
