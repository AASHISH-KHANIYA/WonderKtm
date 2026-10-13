export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public fields?: { path: string; message: string }[], public details?: any) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'wonderktm', ...(init.headers as Record<string, string>) };
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let res: Response;
  try { res = await fetch(`/api${path}`, { credentials: 'include', ...init, headers }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'NETWORK'); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.message ?? "Something went wrong.", e.code, e.fields, e.details ?? data);
  }
  return data as T;
}

const qs = (p?: Record<string, unknown>) => {
  const u = new URLSearchParams();
  Object.entries(p ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: <T,>(path: string, params?: Record<string, unknown>) => request<T>(path + qs(params)),
  post: <T,>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  put: <T,>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PUT', body: JSON.stringify(body), headers }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T,>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
