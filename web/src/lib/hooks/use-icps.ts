import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as icpsApi from '../api/icps';

export const icpKeys = {
  all: (clientId: string) => ['icps', clientId] as const,
  detail: (clientId: string, icpId: string) => ['icps', clientId, icpId] as const,
};

export const sourceKeys = {
  pending: (clientId: string, icpId: string) => ['sources', clientId, icpId] as const,
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

export function useIcpById(icpId: string | null) {
  return useQuery({
    queryKey: ['icps', 'by-id', icpId] as const,
    queryFn: () => icpsApi.getIcpById(icpId!),
    enabled: !!icpId,
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

export function useDeleteIcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId }: { clientId: string; icpId: string }) =>
      icpsApi.deleteIcp(clientId, icpId),
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: icpKeys.all(clientId) });
    },
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

// ── Source hooks ──

export function useSources(clientId: string | null, icpId: string | null) {
  return useQuery({
    queryKey: sourceKeys.pending(clientId!, icpId!),
    queryFn: () => icpsApi.getSources(clientId!, icpId!),
    enabled: !!clientId && !!icpId,
    staleTime: 30 * 1000,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId, file }: { clientId: string; icpId: string; file: File }) =>
      icpsApi.uploadDocument(clientId, icpId, file),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
    },
  });
}

export function useAddTranscript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId, text }: { clientId: string; icpId: string; text: string }) =>
      icpsApi.addTranscript(clientId, icpId, text),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
    },
  });
}

export function useUploadCrmCsv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId, file }: { clientId: string; icpId: string; file: File }) =>
      icpsApi.uploadCrmCsv(clientId, icpId, file),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
    },
  });
}

export function useAddClassicSelectors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      filters,
    }: {
      clientId: string;
      icpId: string;
      filters: Parameters<typeof icpsApi.addClassicSelectors>[2];
    }) => icpsApi.addClassicSelectors(clientId, icpId, filters),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
    },
  });
}

export function useClearSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, icpId }: { clientId: string; icpId: string }) =>
      icpsApi.clearSources(clientId, icpId),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
    },
  });
}

export function useParseSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      opts,
    }: {
      clientId: string;
      icpId: string;
      opts?: { generatePersona?: boolean };
    }) => icpsApi.parseSources(clientId, icpId, opts),
    onSuccess: (_, { clientId, icpId }) => {
      qc.invalidateQueries({ queryKey: sourceKeys.pending(clientId, icpId) });
      qc.invalidateQueries({ queryKey: icpKeys.detail(clientId, icpId) });
      qc.invalidateQueries({ queryKey: ['personas', clientId, icpId] });
    },
  });
}
