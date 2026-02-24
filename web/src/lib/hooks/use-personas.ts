import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as personasApi from '../api/personas';

export const personaKeys = {
  all: (clientId: string, icpId: string) => ['personas', clientId, icpId] as const,
};

export function usePersonas(clientId: string | null, icpId: string | null) {
  return useQuery({
    queryKey: personaKeys.all(clientId!, icpId!),
    queryFn: () => personasApi.getPersonas(clientId!, icpId!),
    enabled: !!clientId && !!icpId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      data,
    }: {
      clientId: string;
      icpId: string;
      data: Parameters<typeof personasApi.createPersona>[2];
    }) => personasApi.createPersona(clientId, icpId, data),
    onSuccess: (_, { clientId, icpId }) =>
      qc.invalidateQueries({ queryKey: personaKeys.all(clientId, icpId) }),
  });
}

export function useUpdatePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      personaId,
      data,
    }: {
      clientId: string;
      icpId: string;
      personaId: string;
      data: Parameters<typeof personasApi.updatePersona>[3];
    }) => personasApi.updatePersona(clientId, icpId, personaId, data),
    onSuccess: (_, { clientId, icpId }) =>
      qc.invalidateQueries({ queryKey: personaKeys.all(clientId, icpId) }),
  });
}

export function useDeletePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      icpId,
      personaId,
    }: {
      clientId: string;
      icpId: string;
      personaId: string;
    }) => personasApi.deletePersona(clientId, icpId, personaId),
    onSuccess: (_, { clientId, icpId }) =>
      qc.invalidateQueries({ queryKey: personaKeys.all(clientId, icpId) }),
  });
}
