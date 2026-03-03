import { apiClient } from '../api-client';
import type { ApiResponse } from '../types';

export async function discoverFromNews(data: { clientId: string; queries: string[]; limit?: number }): Promise<void> {
  await apiClient.post<ApiResponse<unknown>>('/api/discovery/news', data);
}

export async function discoverFromGooglePlaces(data: { clientId: string; query: string; location: string; limit?: number }): Promise<void> {
  await apiClient.post<ApiResponse<unknown>>('/api/discovery/places', data);
}

export async function discoverFromReviews(data: { clientId: string; location: string; category?: string; limit?: number }): Promise<void> {
  await apiClient.post<ApiResponse<unknown>>('/api/discovery/reviews', data);
}

export async function discoverFromListings(data: { clientId: string; platform: 'opentable' | 'ubereats' | 'justeat'; location: string; limit?: number }): Promise<void> {
  await apiClient.post<ApiResponse<unknown>>('/api/discovery/listings', data);
}
