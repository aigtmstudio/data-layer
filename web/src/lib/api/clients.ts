import { apiClient } from '../api-client';
import type { Client, ApiResponse } from '../types';

export async function getClients(): Promise<Client[]> {
  const res = await apiClient.get<ApiResponse<Client[]>>('/api/clients');
  return res.data;
}

export async function getClient(id: string): Promise<Client> {
  const res = await apiClient.get<ApiResponse<Client>>(`/api/clients/${id}`);
  return res.data;
}

export async function createClient(data: {
  name: string;
  slug: string;
  industry?: string;
  website?: string;
  notes?: string;
  creditMarginPercent?: string;
}): Promise<Client> {
  const body: Record<string, unknown> = {
    name: data.name,
    slug: data.slug,
  };
  if (data.industry) body.industry = data.industry;
  if (data.website) body.website = data.website;
  if (data.notes) body.notes = data.notes;
  if (data.creditMarginPercent) body.creditMarginPercent = parseFloat(data.creditMarginPercent);
  const res = await apiClient.post<ApiResponse<Client>>('/api/clients', body);
  return res.data;
}

export async function updateClient(
  id: string,
  data: Partial<{
    name: string;
    industry: string;
    website: string;
    notes: string;
    creditMarginPercent: string;
    settings: Record<string, unknown>;
    isActive: boolean;
  }>,
): Promise<Client> {
  const res = await apiClient.patch<ApiResponse<Client>>(`/api/clients/${id}`, data);
  return res.data;
}

export async function deleteClient(id: string): Promise<Client> {
  const res = await apiClient.delete<ApiResponse<Client>>(`/api/clients/${id}`);
  return res.data;
}
