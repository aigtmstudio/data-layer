import { apiClient } from '../api-client';
import type { Job, ApiResponse } from '../types';

export async function triggerEnrichment(data: {
  clientId: string;
  domains: string[];
  icpId?: string;
  options?: {
    skipContacts?: boolean;
    skipEmailVerification?: boolean;
  };
}): Promise<Job> {
  const res = await apiClient.post<ApiResponse<Job>>('/api/enrichment/companies', data);
  return res.data;
}
