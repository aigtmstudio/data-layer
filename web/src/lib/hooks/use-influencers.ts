import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as influencersApi from '../api/influencers';

export const influencerKeys = {
  all: (clientId: string) => ['influencers', clientId] as const,
};

export function useInfluencers(clientId: string | null) {
  return useQuery({
    queryKey: influencerKeys.all(clientId!),
    queryFn: () => influencersApi.getInfluencers(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useCreateInfluencer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: influencersApi.createInfluencer,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: influencerKeys.all(vars.clientId) });
    },
  });
}

export function useUpdateInfluencer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, clientId, data }: { id: string; clientId: string; data: Parameters<typeof influencersApi.updateInfluencer>[1] }) =>
      influencersApi.updateInfluencer(id, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: influencerKeys.all(vars.clientId) });
    },
  });
}

export function useDeleteInfluencer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; clientId: string }) => influencersApi.deleteInfluencer(id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: influencerKeys.all(vars.clientId) });
    },
  });
}

export function useFetchInfluencerPosts() {
  return useMutation({
    mutationFn: ({ clientId, forceRefresh }: { clientId: string; forceRefresh?: boolean }) =>
      influencersApi.fetchInfluencerPosts(clientId, { forceRefresh }),
  });
}
