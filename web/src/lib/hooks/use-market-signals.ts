import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as signalsApi from '../api/market-signals';

export const signalKeys = {
  all: (clientId?: string) => clientId ? ['market-signals', clientId] as const : ['market-signals'] as const,
  detail: (id: string) => ['market-signals', 'detail', id] as const,
};

export function useMarketSignals(
  clientId: string | null,
  filters?: { category?: string; processed?: boolean; limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: [...signalKeys.all(clientId!), filters],
    queryFn: () => signalsApi.getMarketSignals(clientId!, filters),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useMarketSignal(id: string | null) {
  return useQuery({
    queryKey: signalKeys.detail(id!),
    queryFn: () => signalsApi.getMarketSignal(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useIngestSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signalsApi.ingestSignal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['market-signals'] }),
  });
}

export function useProcessSignals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signalsApi.processSignals,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['market-signals'] }),
  });
}
