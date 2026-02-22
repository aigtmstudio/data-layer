import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as clientsApi from '../api/clients';

export const clientKeys = {
  all: ['clients'] as const,
  detail: (id: string) => ['clients', id] as const,
};

export function useClients() {
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: clientsApi.getClients,
    staleTime: 5 * 60 * 1000,
  });
}

export function useClient(id: string | null) {
  return useQuery({
    queryKey: clientKeys.detail(id!),
    queryFn: () => clientsApi.getClient(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clientsApi.createClient,
    onSuccess: () => qc.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof clientsApi.updateClient>[1] }) =>
      clientsApi.updateClient(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: clientKeys.all });
      qc.invalidateQueries({ queryKey: clientKeys.detail(id) });
    },
  });
}
