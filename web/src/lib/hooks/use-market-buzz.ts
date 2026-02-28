import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as buzzApi from '../api/market-buzz';

export const buzzKeys = {
  all: ['market-buzz'] as const,
  list: (clientId: string) => ['market-buzz', 'list', clientId] as const,
  detail: (id: string) => ['market-buzz', 'detail', id] as const,
};

export function useBuzzReports(clientId: string | undefined) {
  return useQuery({
    queryKey: buzzKeys.list(clientId!),
    queryFn: () => buzzApi.getBuzzReports(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useBuzzReport(id: string | null) {
  return useQuery({
    queryKey: buzzKeys.detail(id!),
    queryFn: () => buzzApi.getBuzzReport(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useGenerateBuzzReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: buzzApi.generateBuzzReport,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: buzzKeys.list(variables.clientId) });
    },
  });
}

export function useDeleteBuzzReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: buzzApi.deleteBuzzReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: buzzKeys.all });
    },
  });
}
