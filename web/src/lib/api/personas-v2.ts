import { apiClient } from '../api-client';
import type { Persona, ApiResponse } from '../types';

export async function getPersonas(clientId: string): Promise<Persona[]> {
  const res = await apiClient.get<ApiResponse<Persona[]>>(`/api/personas?clientId=${clientId}`);
  return res.data;
}

export async function getPersona(id: string): Promise<Persona> {
  const res = await apiClient.get<ApiResponse<Persona>>(`/api/personas/${id}`);
  return res.data;
}

export async function createPersona(data: {
  clientId: string;
  icpId: string;
  name: string;
  description?: string;
  titlePatterns?: string[];
  seniorityLevels?: string[];
  departments?: string[];
  countries?: string[];
  states?: string[];
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;
  excludeTitlePatterns?: string[];
}): Promise<Persona> {
  const res = await apiClient.post<ApiResponse<Persona>>('/api/personas', data);
  return res.data;
}

export async function updatePersona(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    titlePatterns: string[];
    seniorityLevels: string[];
    departments: string[];
    countries: string[];
    states: string[];
    yearsExperienceMin: number;
    yearsExperienceMax: number;
    excludeTitlePatterns: string[];
    isActive: boolean;
  }>,
): Promise<Persona> {
  const res = await apiClient.patch<ApiResponse<Persona>>(`/api/personas/${id}`, data);
  return res.data;
}

export async function deletePersona(id: string): Promise<Persona> {
  const res = await apiClient.delete<ApiResponse<Persona>>(`/api/personas/${id}`);
  return res.data;
}
