import { apiClient } from '../api-client';
import type { List, ListMember, ListType, Job, ApiResponse } from '../types';

export async function getLists(clientId?: string): Promise<List[]> {
  const query = clientId ? `?clientId=${clientId}` : '';
  const res = await apiClient.get<ApiResponse<List[]>>(`/api/lists${query}`);
  return res.data;
}

export async function getList(id: string): Promise<List> {
  const res = await apiClient.get<ApiResponse<List>>(`/api/lists/${id}`);
  return res.data;
}

export async function createList(data: {
  clientId: string;
  icpId?: string;
  personaId?: string;
  name: string;
  description?: string;
  type?: ListType;
}): Promise<List> {
  const res = await apiClient.post<ApiResponse<List>>('/api/lists', data);
  return res.data;
}

export async function buildList(id: string): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(`/api/lists/${id}/build`);
  return res.data;
}

export async function refreshList(id: string): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(`/api/lists/${id}/refresh`);
  return res.data;
}

export async function updateListSchedule(
  id: string,
  data: { refreshEnabled: boolean; refreshCron?: string },
): Promise<List> {
  const res = await apiClient.patch<ApiResponse<List>>(`/api/lists/${id}/schedule`, data);
  return res.data;
}

export async function getBuildStatus(id: string): Promise<Job> {
  const res = await apiClient.get<ApiResponse<Job>>(`/api/lists/${id}/build-status`);
  return res.data;
}

interface RawListMember {
  id: string;
  companyId: string | null;
  contactId: string | null;
  icpFitScore: string | null;
  addedReason: string | null;
  addedAt: string;
  companyName: string | null;
  companyDomain: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
}

export async function getListMembers(
  id: string,
  params?: { limit?: number; offset?: number },
): Promise<ListMember[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient.get<ApiResponse<RawListMember[]>>(`/api/lists/${id}/members${qs}`);

  // Transform flat API response into nested ListMember shape
  return res.data.map((row) => ({
    id: row.id,
    listId: id,
    companyId: row.companyId,
    contactId: row.contactId,
    icpFitScore: row.icpFitScore,
    addedReason: row.addedReason,
    addedAt: row.addedAt,
    removedAt: null,
    company: row.companyId
      ? { name: row.companyName ?? '', domain: row.companyDomain } as ListMember['company']
      : undefined,
    contact: row.contactId
      ? {
          firstName: row.contactName?.split(' ')[0] ?? null,
          lastName: row.contactName?.split(' ').slice(1).join(' ') ?? null,
          title: row.contactTitle ?? null,
          workEmail: row.contactEmail ?? null,
        } as ListMember['contact']
      : undefined,
  }));
}
