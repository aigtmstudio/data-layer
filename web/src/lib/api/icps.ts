import { apiClient } from '../api-client';
import type { Icp, IcpFilters, ApiResponse } from '../types';

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

export async function parseIcp(clientId: string, icpId: string): Promise<Icp> {
  const res = await apiClient.post<ApiResponse<Icp>>(`/api/clients/${clientId}/icps/${icpId}/parse`);
  return res.data;
}
