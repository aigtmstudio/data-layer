import { apiClient } from '../api-client';
import type { WebinarSpeaker, ApiResponse } from '../types';

export async function getSpeakers(buzzReportId: string, angleIndex?: number): Promise<WebinarSpeaker[]> {
  const params = new URLSearchParams({ buzzReportId });
  if (angleIndex !== undefined) params.set('angleIndex', String(angleIndex));
  const res = await apiClient.get<ApiResponse<WebinarSpeaker[]>>(`/api/webinar-speakers?${params}`);
  return res.data;
}

export async function findSpeakers(params: {
  clientId: string;
  buzzReportId: string;
  angleIndex: number;
}): Promise<{ jobId: string; buzzReportId: string; angleIndex: number }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string; buzzReportId: string; angleIndex: number }>>(
    '/api/webinar-speakers/find',
    params,
  );
  return res.data;
}

export async function deleteSpeaker(id: string): Promise<void> {
  await apiClient.delete(`/api/webinar-speakers/${id}`);
}
