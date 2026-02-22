import { apiClient } from '../api-client';
import type { CreditTransaction, ApiResponse } from '../types';

export async function getCreditBalance(clientId: string): Promise<{ balance: string; recentTransactions: CreditTransaction[] }> {
  const res = await apiClient.get<ApiResponse<{ balance: string; recentTransactions: CreditTransaction[] }>>(`/api/credits/${clientId}`);
  return res.data;
}

export async function getCreditHistory(clientId: string, limit = 100): Promise<CreditTransaction[]> {
  const res = await apiClient.get<ApiResponse<CreditTransaction[]>>(
    `/api/credits/${clientId}/usage?limit=${limit}`,
  );
  return res.data;
}

export async function addCredits(
  clientId: string,
  data: { amount: number; description?: string },
): Promise<CreditTransaction> {
  const res = await apiClient.post<ApiResponse<CreditTransaction>>(
    `/api/credits/${clientId}/add`,
    { ...data, type: 'purchase', description: data.description || 'Manual credit addition' },
  );
  return res.data;
}
