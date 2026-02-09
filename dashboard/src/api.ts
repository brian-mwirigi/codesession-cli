const API_BASE = '/api/v1';

export async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  // Normalize: if caller passes '/api/foo', strip the /api prefix
  const cleanPath = path.replace(/^\/api\//, '/');
  const url = new URL(`${API_BASE}${cleanPath}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
