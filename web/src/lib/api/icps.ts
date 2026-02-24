import { apiClient } from '../api-client';
import type { Icp, IcpFilters, ApiResponse, SourceUploadResponse, PendingSource, ParseSourcesResponse } from '../types';

export async function getIcps(clientId: string): Promise<Icp[]> {
  const res = await apiClient.get<ApiResponse<Icp[]>>(`/api/clients/${clientId}/icps`);
  return res.data;
}

export async function getIcp(clientId: string, icpId: string): Promise<Icp> {
  const res = await apiClient.get<ApiResponse<Icp>>(`/api/clients/${clientId}/icps/${icpId}`);
  return res.data;
}

export async function createIcp(
  clientId: string,
  data: {
    name: string;
    description?: string;
    naturalLanguageInput?: string;
    filters?: IcpFilters;
  },
): Promise<Icp> {
  const res = await apiClient.post<ApiResponse<Icp>>(`/api/clients/${clientId}/icps`, data);
  return res.data;
}

export async function updateIcp(
  clientId: string,
  icpId: string,
  data: Partial<{
    name: string;
    description: string;
    naturalLanguageInput: string;
    filters: IcpFilters;
    isActive: boolean;
  }>,
): Promise<Icp> {
  const res = await apiClient.patch<ApiResponse<Icp>>(`/api/clients/${clientId}/icps/${icpId}`, data);
  return res.data;
}

export async function deleteIcp(clientId: string, icpId: string): Promise<Icp> {
  const res = await apiClient.delete<ApiResponse<Icp>>(`/api/clients/${clientId}/icps/${icpId}`);
  return res.data;
}

export async function parseIcp(clientId: string, icpId: string): Promise<Icp> {
  const res = await apiClient.post<ApiResponse<Icp>>(`/api/clients/${clientId}/icps/${icpId}/parse`);
  return res.data;
}

// ── Source management ──

export async function uploadDocument(clientId: string, icpId: string, file: File): Promise<SourceUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.postFormData<ApiResponse<SourceUploadResponse>>(
    `/api/clients/${clientId}/icps/${icpId}/sources/document`,
    formData,
  );
  return res.data;
}

export async function addTranscript(clientId: string, icpId: string, text: string): Promise<SourceUploadResponse> {
  const res = await apiClient.post<ApiResponse<SourceUploadResponse>>(
    `/api/clients/${clientId}/icps/${icpId}/sources/transcript`,
    { text },
  );
  return res.data;
}

export async function uploadCrmCsv(clientId: string, icpId: string, file: File): Promise<SourceUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.postFormData<ApiResponse<SourceUploadResponse>>(
    `/api/clients/${clientId}/icps/${icpId}/sources/crm-csv`,
    formData,
  );
  return res.data;
}

export async function addClassicSelectors(
  clientId: string,
  icpId: string,
  filters: Partial<IcpFilters>,
): Promise<SourceUploadResponse> {
  const res = await apiClient.post<ApiResponse<SourceUploadResponse>>(
    `/api/clients/${clientId}/icps/${icpId}/sources/classic`,
    filters,
  );
  return res.data;
}

export async function getSources(clientId: string, icpId: string): Promise<PendingSource[]> {
  const res = await apiClient.get<ApiResponse<PendingSource[]>>(
    `/api/clients/${clientId}/icps/${icpId}/sources`,
  );
  return res.data;
}

export async function clearSources(clientId: string, icpId: string): Promise<void> {
  await apiClient.delete(`/api/clients/${clientId}/icps/${icpId}/sources`);
}

export async function parseSources(
  clientId: string,
  icpId: string,
  opts?: { generatePersona?: boolean },
): Promise<ParseSourcesResponse> {
  const res = await apiClient.post<ApiResponse<ParseSourcesResponse>>(
    `/api/clients/${clientId}/icps/${icpId}/parse-sources`,
    opts,
  );
  return res.data;
}
