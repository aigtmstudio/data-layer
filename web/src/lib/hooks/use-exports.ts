import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as exportsApi from '../api/exports';

export function useTriggerExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: exportsApi.triggerExport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
