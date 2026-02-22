import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as creditsApi from '../api/credits';

export const creditKeys = {
  balance: (clientId: string) => ['credits', 'balance', clientId] as const,
  history: (clientId: string) => ['credits', 'history', clientId] as const,
};

export function useCreditBalance(clientId: string | null) {
  return useQuery({
    queryKey: creditKeys.balance(clientId!),
    queryFn: () => creditsApi.getCreditBalance(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useCreditHistory(clientId: string | null) {
  return useQuery({
    queryKey: creditKeys.history(clientId!),
    queryFn: () => creditsApi.getCreditHistory(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
  });
}

export function useAddCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: { amount: number; description?: string } }) =>
      creditsApi.addCredits(clientId, data),
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: creditKeys.balance(clientId) });
      qc.invalidateQueries({ queryKey: creditKeys.history(clientId) });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
