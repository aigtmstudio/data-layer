import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as enrichmentApi from '../api/enrichment';

export function useTriggerEnrichment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enrichmentApi.triggerEnrichment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}
