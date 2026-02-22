import { apiClient } from '../api-client';
import type { ExportFormat, ApiResponse } from '../types';

export async function triggerExport(data: {
  clientId: string;
  listId: string;
  format: ExportFormat;
  destination?: Record<string, unknown>;
}): Promise<{ jobId?: string; url?: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId?: string; url?: string }>>(
    '/api/exports',
    data,
  );
  return res.data;
}
