import { supabase } from './supabase';

export class ApiClientError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status = 500, payload: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new ApiClientError(error.message, 401);
  }
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiClientError('Authentication required', 401);
  }
  return token;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error ?? response.statusText)
        : response.statusText || 'Request failed';
    throw new ApiClientError(message, response.status, payload);
  }

  return payload as T;
}
