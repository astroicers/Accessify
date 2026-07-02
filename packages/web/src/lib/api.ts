// 前端 API client（typed fetch；同源 /api，session token via Bearer）

const TOKEN_KEY = 'accessify.token';
const ROLE_KEY = 'accessify.role';
const MUSTCHANGE_KEY = 'accessify.mustChange';
const USERNAME_KEY = 'accessify.username';

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getRole(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(ROLE_KEY) : null;
}
export function setRole(role: string | null): void {
  if (role) localStorage.setItem(ROLE_KEY, role);
  else localStorage.removeItem(ROLE_KEY);
}
// 強制改密旗標須持久化：否則 F5 重整即遺失、gate 被繞過（T801）。
export function getMustChange(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(MUSTCHANGE_KEY) === '1';
}
export function setMustChange(v: boolean): void {
  if (v) localStorage.setItem(MUSTCHANGE_KEY, '1');
  else localStorage.removeItem(MUSTCHANGE_KEY);
}
// 登入者帳號名（帳號管理頁辨識「自己」那列用；權威守衛在後端 selfManage）
export function getUsername(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(USERNAME_KEY);
}
export function setUsername(v: string | null): void {
  if (v) localStorage.setItem(USERNAME_KEY, v);
  else localStorage.removeItem(USERNAME_KEY);
}

/** 報表下載 URL（同源；session cookie 授權，供 <a download> 使用）。 */
export function reportDownloadUrl(reportId: number): string {
  return `/api/reports/${reportId}/download`;
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

export interface PortalUser {
  id: number;
  username: string;
  role: 'admin' | 'viewer';
  status: 'active' | 'disabled';
  locked: boolean;
  must_change_password: number;
  created_at: string;
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
export interface Schedule {
  id: number;
  target: string;
  type: 'url' | 'sitemap';
  interval_seconds: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}
export interface DiffIssue {
  pageUrl: string;
  wcagRef: string | null;
  ruleCode: string;
  severity: string;
  selector: string | null;
  message: string | null;
}
export interface ScanDiff {
  scanTaskId: number;
  baselineScanId: number | null;
  fixed: DiffIssue[];
  added: DiffIssue[];
  unchanged: DiffIssue[];
}
export interface Notification {
  id: number;
  kind: string;
  scan_task_id: number | null;
  message_key: string;
  params_json: string | null;
  read: number;
  created_at: string;
}
export interface ServerStatus {
  overall: 'healthy' | 'degraded' | 'down';
  uptimeSec: number;
  queue: { queued: number; running: number; failed: number; completed: number; oldestQueuedAgeSec: number | null };
  worker: { heartbeatStaleSec: number | null; staleLeases: number };
  db: { integrity: 'ok' | 'fail'; schemaVersion: number };
  disk: { usedPct: number; freeBytes: number; totalBytes: number } | null;
  tls: { daysRemaining: number } | null;
  versions: { node: string; app: string; schema: number };
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; role: string; mustChangePassword: boolean }>('POST', '/api/auth/login', {
      username,
      password,
    }),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),
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
  getStatus: () => request<ServerStatus>('GET', '/api/status'),
  listUsers: () => request<PortalUser[]>('GET', '/api/users'),
  createUser: (body: { username: string; role: 'admin' | 'viewer'; password?: string }) =>
    request<{ id: number; username: string; generatedPassword?: string }>('POST', '/api/users', body),
  updateUser: (id: number, body: { role?: 'admin' | 'viewer'; status?: 'active' | 'disabled' }) =>
    request<{ ok: boolean }>('PUT', `/api/users/${id}`, body),
  resetUserPassword: (id: number) =>
    request<{ generatedPassword: string }>('POST', `/api/users/${id}/reset-password`),
  getSettings: () => request<Record<string, string>>('GET', '/api/settings'),
  updateSettings: (body: Record<string, string>) => request<{ ok: boolean }>('PUT', '/api/settings', body),
  getDiff: (id: number) => request<ScanDiff>('GET', `/api/scans/${id}/diff`),
  listSchedules: () => request<Schedule[]>('GET', '/api/schedules'),
  createSchedule: (body: { target: string; type: 'url' | 'sitemap'; interval_seconds: number }) =>
    request<{ id: number }>('POST', '/api/schedules', body),
  updateSchedule: (id: number, body: { enabled?: boolean; interval_seconds?: number }) =>
    request<{ ok: boolean }>('PUT', `/api/schedules/${id}`, body),
  deleteSchedule: (id: number) => request<{ ok: boolean }>('DELETE', `/api/schedules/${id}`),
  listNotifications: () => request<Notification[]>('GET', '/api/notifications'),
  unreadCount: () => request<{ count: number }>('GET', '/api/notifications/unread-count'),
  markNotificationRead: (id: number) => request<{ ok: boolean }>('POST', `/api/notifications/${id}/read`),
  markAllNotificationsRead: () => request<{ updated: number }>('POST', '/api/notifications/read-all'),
};
