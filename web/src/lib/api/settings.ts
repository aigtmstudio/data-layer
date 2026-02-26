import { apiClient } from '../api-client';
import type { PromptConfig, ApiResponse } from '../types';

export async function getPromptConfigs(): Promise<PromptConfig[]> {
  const res = await apiClient.get<ApiResponse<PromptConfig[]>>('/api/settings/prompts');
  return res.data;
}

export async function updatePromptConfig(key: string, content: string): Promise<PromptConfig> {
  const res = await apiClient.patch<ApiResponse<PromptConfig>>(`/api/settings/prompts/${encodeURIComponent(key)}`, { content });
  return res.data;
}

export async function resetPromptConfig(key: string): Promise<PromptConfig> {
  const res = await apiClient.delete<ApiResponse<PromptConfig>>(`/api/settings/prompts/${encodeURIComponent(key)}`);
  return res.data;
}
