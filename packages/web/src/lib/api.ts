// 前端 API client（typed fetch；同源 /api，session token via Bearer）

const TOKEN_KEY = 'accessify.token';

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public messageKey: string,
  ) {
    super(messageKey);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { messageKey?: string };
    throw new ApiError(res.status, err.messageKey ?? 'error.unknown');
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface ScanTask {
  id: number;
  target: string;
  type: string;
  status: string;
  created_at: string;
}
export interface IssueCount {
  severity: string;
  count: number;
}
export interface Issue {
  id: number;
  engine: string;
  rule_code: string;
  wcag_ref: string | null;
  severity: string;
  selector: string;
  message: string;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; role: string; mustChangePassword: boolean }>('POST', '/api/auth/login', {
      username,
      password,
    }),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout'),
  listScans: () => request<ScanTask[]>('GET', '/api/scans'),
  createScan: (target: string, type: 'url' | 'sitemap') =>
    request<{ id: number; status: string }>('POST', '/api/scans', { target, type }),
  getScan: (id: number) =>
    request<ScanTask & { issueCounts: IssueCount[] }>('GET', `/api/scans/${id}`),
  getIssues: (id: number) => request<Issue[]>('GET', `/api/scans/${id}/issues`),
  getReports: (id: number) =>
    request<{ id: number; lang: string; format: string; created_at: string }[]>(
      'GET',
      `/api/scans/${id}/reports`,
    ),
};
