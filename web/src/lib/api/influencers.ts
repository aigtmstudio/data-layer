import { apiClient } from '../api-client';
import type { ApiResponse } from '../types';

export interface Influencer {
  id: string;
  clientId: string;
  name: string;
  platform: 'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin';
  handle: string;
  profileUrl?: string;
  category?: 'industry_expert' | 'journalist' | 'competitor_exec' | 'customer';
  notes?: string;
  isActive: boolean;
  lastFetchedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getInfluencers(clientId: string): Promise<Influencer[]> {
  const res = await apiClient.get<ApiResponse<Influencer[]>>(`/api/influencers?clientId=${clientId}`);
  return res.data;
}

export async function createInfluencer(data: {
  clientId: string;
  name: string;
  platform: Influencer['platform'];
  handle: string;
  profileUrl?: string;
  category?: Influencer['category'];
  notes?: string;
}): Promise<Influencer> {
  const res = await apiClient.post<ApiResponse<Influencer>>('/api/influencers', data);
  return res.data;
}

export async function updateInfluencer(id: string, data: Partial<Pick<Influencer, 'name' | 'handle' | 'profileUrl' | 'category' | 'notes' | 'isActive'>>): Promise<Influencer> {
  const res = await apiClient.patch<ApiResponse<Influencer>>(`/api/influencers/${id}`, data);
  return res.data;
}

export async function deleteInfluencer(id: string): Promise<void> {
  await apiClient.delete(`/api/influencers/${id}`);
}

export async function fetchInfluencerPosts(clientId: string, options?: { forceRefresh?: boolean }): Promise<{ influencersChecked: number; influencersSkipped: number; signalsIngested: number; totalInfluencers?: number; errors: { handle: string; platform: string; error: string }[] }> {
  const res = await apiClient.post<ApiResponse<{ influencersChecked: number; influencersSkipped: number; signalsIngested: number; totalInfluencers?: number; errors: { handle: string; platform: string; error: string }[] }>>('/api/influencers/fetch-posts', { clientId, ...options });
  return res.data;
}
