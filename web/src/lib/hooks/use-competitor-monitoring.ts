import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as competitorApi from '../api/competitor-monitoring';

export const competitorKeys = {
  competitors: (clientId: string) => ['competitors', clientId] as const,
  alerts: (clientId: string, status?: string) => ['competitor-alerts', clientId, status] as const,
};

export function useCompetitors(clientId: string | null) {
  return useQuery({
    queryKey: competitorKeys.competitors(clientId!),
    queryFn: () => competitorApi.getCompetitors(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useAddCompetitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: competitorApi.addCompetitor,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: competitorKeys.competitors(vars.clientId) });
    },
  });
}

export function useRemoveCompetitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; clientId: string }) => competitorApi.removeCompetitor(id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: competitorKeys.competitors(vars.clientId) });
    },
  });
}

export function useCompetitorAlerts(clientId: string | null, status?: 'ongoing' | 'resolved') {
  return useQuery({
    queryKey: competitorKeys.alerts(clientId!, status),
    queryFn: () => competitorApi.getAlerts(clientId!, status),
    enabled: !!clientId,
    staleTime: 60 * 1000,
    refetchInterval: status === 'ongoing' ? 2 * 60 * 1000 : false, // poll every 2 min for ongoing
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; clientId: string }) => competitorApi.dismissAlert(id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: competitorKeys.alerts(vars.clientId) });
    },
  });
}

export function useCheckDowntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId }: { clientId: string }) => competitorApi.checkDowntime(clientId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: competitorKeys.alerts(vars.clientId) });
      queryClient.invalidateQueries({ queryKey: competitorKeys.competitors(vars.clientId) });
    },
  });
}
