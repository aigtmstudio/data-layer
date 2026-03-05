import { apiClient } from '../api-client';

interface ApiResponse<T> { data: T }

export interface TestResult {
  method: string;
  durationMs: number;
  stats: Record<string, number>;
  [key: string]: unknown;
}

export async function testGooglePlaces(params: {
  query: string;
  location: string;
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/google-places', params);
  return res.data;
}

export async function testReviews(params: {
  location: string;
  category: string;
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/reviews', params);
  return res.data;
}

export async function testNews(params: {
  queries: string[];
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/news', params);
  return res.data;
}

export async function testListings(params: {
  platform: 'opentable' | 'ubereats' | 'justeat';
  location: string;
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/listings', params);
  return res.data;
}

export async function testSocial(params: {
  platform: 'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin';
  keywords: string[];
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/social', params);
  return res.data;
}

export async function testSocialCompanies(params: {
  platform: 'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin';
  keywords: string[];
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/social-companies', params);
  return res.data;
}

export async function testEvidence(params: {
  query: string;
  category: 'news' | 'tweet';
  limit: number;
}): Promise<TestResult> {
  const res = await apiClient.post<ApiResponse<TestResult>>('/api/discovery-test/evidence', params);
  return res.data;
}
