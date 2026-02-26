import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as settingsApi from '../api/settings';

export const promptConfigKeys = {
  all: ['prompt-configs'] as const,
};

export function usePromptConfigs() {
  return useQuery({
    queryKey: promptConfigKeys.all,
    queryFn: settingsApi.getPromptConfigs,
    staleTime: 60 * 1000,
  });
}

export function useUpdatePromptConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      settingsApi.updatePromptConfig(key, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: promptConfigKeys.all }),
  });
}

export function useResetPromptConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => settingsApi.resetPromptConfig(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: promptConfigKeys.all }),
  });
}
