import ky, { type Options } from 'ky';
import { logger } from './logger.js';

export async function httpRequest<T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  options?: {
    headers?: Record<string, string>;
    body?: unknown;
    params?: Record<string, string>;
    timeout?: number;
  },
): Promise<T> {
  const kyOptions: Options = {
    headers: options?.headers,
    timeout: options?.timeout ?? 30000,
    retry: { limit: 0 },
    searchParams: options?.params,
  };

  if (options?.body && (method === 'post' || method === 'put' || method === 'patch')) {
    kyOptions.json = options.body;
  }

  try {
    const response = await ky[method](url, kyOptions);
    return await response.json<T>();
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ method, url, error: errMsg }, 'HTTP request failed');
    throw error;
  }
}
