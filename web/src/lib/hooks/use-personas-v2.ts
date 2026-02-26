import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as personasApi from '../api/personas-v2';

export const personaV2Keys = {
  all: (clientId?: string) => clientId ? ['personas-v2', clientId] as const : ['personas-v2'] as const,
  detail: (id: string) => ['personas-v2', 'detail', id] as const,
};

export function usePersonasV2(clientId: string | null) {
  return useQuery({
    queryKey: personaV2Keys.all(clientId!),
    queryFn: () => personasApi.getPersonas(clientId!),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePersonaV2(id: string | null) {
  return useQuery({
    queryKey: personaV2Keys.detail(id!),
    queryFn: () => personasApi.getPersona(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePersonaV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: personasApi.createPersona,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas-v2'] }),
  });
}

export function useUpdatePersonaV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof personasApi.updatePersona>[1] }) =>
      personasApi.updatePersona(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas-v2'] }),
  });
}

export function useDeletePersonaV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: personasApi.deletePersona,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas-v2'] }),
  });
}
