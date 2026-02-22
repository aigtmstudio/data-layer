import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as listsApi from '../api/lists';

export const listKeys = {
  all: (clientId?: string) => clientId ? ['lists', clientId] as const : ['lists'] as const,
  detail: (id: string) => ['lists', 'detail', id] as const,
  members: (id: string) => ['lists', 'members', id] as const,
};

export function useLists(clientId?: string) {
  return useQuery({
    queryKey: listKeys.all(clientId),
    queryFn: () => listsApi.getLists(clientId),
    staleTime: 30 * 1000,
  });
}

export function useList(id: string | null) {
  return useQuery({
    queryKey: listKeys.detail(id!),
    queryFn: () => listsApi.getList(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useListMembers(id: string | null, params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: [...listKeys.members(id!), params],
    queryFn: () => listsApi.getListMembers(id!, params),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: listsApi.createList,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  });
}

export function useBuildList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: listsApi.buildList,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useRefreshList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: listsApi.refreshList,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useUpdateListSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof listsApi.updateListSchedule>[1] }) =>
      listsApi.updateListSchedule(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: listKeys.detail(id) });
    },
  });
}
