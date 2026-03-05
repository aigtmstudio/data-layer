import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as speakersApi from '../api/webinar-speakers';

export const speakerKeys = {
  all: ['webinar-speakers'] as const,
  byReport: (buzzReportId: string) => ['webinar-speakers', 'report', buzzReportId] as const,
  byAngle: (buzzReportId: string, angleIndex: number) =>
    ['webinar-speakers', 'angle', buzzReportId, angleIndex] as const,
};

export function useSpeakers(buzzReportId: string | undefined, angleIndex?: number) {
  return useQuery({
    queryKey: angleIndex !== undefined
      ? speakerKeys.byAngle(buzzReportId!, angleIndex)
      : speakerKeys.byReport(buzzReportId!),
    queryFn: () => speakersApi.getSpeakers(buzzReportId!, angleIndex),
    enabled: !!buzzReportId,
    staleTime: 30 * 1000,
  });
}

export function useFindSpeakers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: speakersApi.findSpeakers,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: speakerKeys.byReport(variables.buzzReportId) });
    },
  });
}

export function useDeleteSpeaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: speakersApi.deleteSpeaker,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: speakerKeys.all });
    },
  });
}
