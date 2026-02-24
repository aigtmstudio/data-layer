import { apiClient } from '../api-client';
import type { Persona, ApiResponse } from '../types';

export async function getPersonas(clientId: string, icpId: string): Promise<Persona[]> {
  const res = await apiClient.get<ApiResponse<Persona[]>>(
    `/api/clients/${clientId}/icps/${icpId}/personas`,
  );
  return res.data;
}

export async function createPersona(
  clientId: string,
  icpId: string,
  data: {
    name: string;
    description?: string;
    titlePatterns?: string[];
    seniorityLevels?: string[];
    departments?: string[];
    countries?: string[];
    yearsExperienceMin?: number;
    yearsExperienceMax?: number;
    excludeTitlePatterns?: string[];
  },
): Promise<Persona> {
  const res = await apiClient.post<ApiResponse<Persona>>(
    `/api/clients/${clientId}/icps/${icpId}/personas`,
    data,
  );
  return res.data;
}

export async function updatePersona(
  clientId: string,
  icpId: string,
  personaId: string,
  data: Partial<{
    name: string;
    description: string;
    titlePatterns: string[];
    seniorityLevels: string[];
    departments: string[];
    countries: string[];
    yearsExperienceMin: number;
    yearsExperienceMax: number;
    excludeTitlePatterns: string[];
    isActive: boolean;
  }>,
): Promise<Persona> {
  const res = await apiClient.patch<ApiResponse<Persona>>(
    `/api/clients/${clientId}/icps/${icpId}/personas/${personaId}`,
    data,
  );
  return res.data;
}

export async function deletePersona(
  clientId: string,
  icpId: string,
  personaId: string,
): Promise<Persona> {
  const res = await apiClient.delete<ApiResponse<Persona>>(
    `/api/clients/${clientId}/icps/${icpId}/personas/${personaId}`,
  );
  return res.data;
}
