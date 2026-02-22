import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as icpsApi from '../api/icps';

export const icpKeys = {
  all: (clientId: string) => ['icps', clientId] as const,
  detail: (clientId: string, icpId: string) => ['icps', clientId, icpId] as const,
};

export function useIcps(clientId: string | null) {
  return useQuery({
    queryKey: icpKeys.all(clientId!),
    queryFn: () => icpsApi.getIcps(clientId!),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useIcp(clientId: string | null, icpId: string | null) {
  return useQuery({
    queryKey: icpKeys.detail(clientId!, icpId!),
    queryFn: () => icpsApi.getIcp(clientId!, icpId!),
    enabled: !!clientId && !!icpId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: Parameters<typeof icpsApi.createIcp>[1] }) =>
      icpsApi.createIcp(clientId, data),
    onSuccess: (_, { clientId }) => qc.invalidateQueries({ queryKey: icpKeys.all(clientId) }),
  });
}

export function useUpdateIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      data,
    }: {
      clientId: string;
      icpId: string;
      data: Parameters<typeof icpsApi.updateIcp>[2];
    }) => icpsApi.updateIcp(clientId, icpId, data),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: icpKeys.all(clientId) });
      qc.invalidateQueries({ queryKey: icpKeys.detail(clientId, icpId) });
    },
  });
}

export function useParseIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId }: { clientId: string; icpId: string }) =>
      icpsApi.parseIcp(clientId, icpId),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: icpKeys.detail(clientId, icpId) });
    },
  });
}
