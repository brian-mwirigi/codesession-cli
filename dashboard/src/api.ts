const API_BASE = '/api/v1';

// Read session token from server-injected global or URL query param
function getToken(): string | null {
  return (window as any).__CS_TOKEN
    || new URLSearchParams(window.location.search).get('token')
    || null;
}

export async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  // Normalize: if caller passes '/api/foo', strip the /api prefix
  const cleanPath = path.replace(/^\/api\//, '/');
  const url = new URL(`${API_BASE}${cleanPath}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchDiff(sessionId: number, filePath?: string): Promise<string> {
  const token = getToken();
  const params = new URLSearchParams();
  if (filePath) params.set('file', filePath);
  if (token) params.set('token', token);
  const url = `${window.location.origin}/api/v1/sessions/${sessionId}/diff?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Diff API ${res.status}`);
  return res.text();
}

export async function fetchCommitDiff(sessionId: number, hash: string, filePath?: string): Promise<string> {
  const token = getToken();
  const params = new URLSearchParams();
  if (filePath) params.set('file', filePath);
  if (token) params.set('token', token);
  const url = `${window.location.origin}/api/v1/sessions/${sessionId}/commits/${hash}/diff?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Diff API ${res.status}`);
  return res.text();
}
