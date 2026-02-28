import { apiClient } from '../api-client';
import type { ApiResponse } from '../types';

// ── Types ──

export interface TrendingTopic {
  topic: string;
  description: string;
  category: string;
  signalCount: number;
  avgRelevance: number;
  affectedSegments: string[];
  /** 0-100 composite buzz score: recency × multi-source coverage × relevance */
  buzzScore: number;
  /** How many distinct source domains cover this topic */
  sourceCount: number;
  /** Average age in days of supporting signals */
  recencyDays: number;
  /** Key sources driving this topic */
  sources: {
    domain: string;
    url: string;
    title: string;
    authority: 'major' | 'niche' | 'unknown';
  }[];
  clientRelevance: {
    matchingProducts: string[];
    matchingCapabilities: string[];
    reasoning: string;
    overlapScore: number;
  };
  supportingSignals: {
    headline: string;
    sourceUrl: string | null;
    sourceDomain: string | null;
    relevanceScore: number;
    detectedAt: string;
  }[];
}

export interface WebinarAngle {
  title: string;
  description: string;
  targetSegments: string[];
  trendConnection: string;
  clientAngle: string;
  talkingPoints: string[];
  estimatedAppeal: 'high' | 'medium' | 'low';
}

export interface SeedCopy {
  type: 'email_subject' | 'email_body' | 'linkedin_post' | 'linkedin_inmessage';
  topic: string;
  targetSegment: string;
  content: string;
  tone: string;
  cta: string;
}

export interface BuzzReport {
  version: 1;
  generatedAt: string;
  timeWindow: { days: number; from: string; to: string };
  inputSummary: {
    signalsAnalyzed: number;
    hypothesesConsidered: number;
    icpSegments: string[];
    clientProducts: string[];
  };
  trendingTopics: TrendingTopic[];
  webinarAngles: WebinarAngle[];
  seedCopy: SeedCopy[];
}

export interface BuzzReportSummary {
  id: string;
  clientId: string;
  timeWindowDays: number;
  icpIds: string[] | null;
  signalsAnalyzed: number | null;
  topicsCount: number | null;
  webinarAnglesCount: number | null;
  copySnippetsCount: number | null;
  inputHash: string | null;
  jobId: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface BuzzReportDetail extends BuzzReportSummary {
  report: BuzzReport | null;
}

// ── API calls ──

export async function getBuzzReports(clientId: string, limit?: number): Promise<BuzzReportSummary[]> {
  const params = new URLSearchParams({ clientId });
  if (limit) params.set('limit', String(limit));
  const res = await apiClient.get<ApiResponse<BuzzReportSummary[]>>(
    `/api/market-buzz?${params}`,
  );
  return res.data;
}

export async function getBuzzReport(id: string): Promise<BuzzReportDetail> {
  const res = await apiClient.get<ApiResponse<BuzzReportDetail>>(
    `/api/market-buzz/${id}`,
  );
  return res.data;
}

export async function generateBuzzReport(data: {
  clientId: string;
  timeWindowDays?: number;
  icpIds?: string[];
  forceRegenerate?: boolean;
}): Promise<{ jobId: string; reportId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string; reportId: string }>>(
    '/api/market-buzz/generate',
    data,
  );
  return res.data;
}

export async function deleteBuzzReport(id: string): Promise<void> {
  await apiClient.delete(`/api/market-buzz/${id}`);
}
