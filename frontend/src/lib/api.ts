/**
 * api.ts — Centralised fetch wrapper for all Garby backend API calls.
 * All calls automatically include the Supabase JWT from localStorage.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface ApiOptions extends RequestInit {
  token?: string
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message ?? `API error: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string, opts?: ApiOptions)           => apiFetch<T>(path, { method: 'GET', ...opts }),
  post:   <T>(path: string, body: unknown, opts?: ApiOptions) => apiFetch<T>(path, { method: 'POST',   body: JSON.stringify(body), ...opts }),
  put:    <T>(path: string, body: unknown, opts?: ApiOptions) => apiFetch<T>(path, { method: 'PUT',    body: JSON.stringify(body), ...opts }),
  delete: <T>(path: string, opts?: ApiOptions)           => apiFetch<T>(path, { method: 'DELETE', ...opts }),
}
