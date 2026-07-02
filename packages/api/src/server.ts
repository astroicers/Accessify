// @accessify/api/server — REST API（T502 / FR-206 / ADR-001）
// Fastify + session 中介層 + RBAC 守衛 + route schema（即契約）+ OpenAPI。DI 以利 inject 測試。

import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import {
  enqueueJob,
  writeAudit,
  computeDiff,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  type Db,
} from '@accessify/core';
import {
  authenticate,
  changePassword,
  createSession,
  createUser,
  destroySession,
  destroyOtherSessions,
  destroyUserSessions,
  generateOneTimePassword,
  hashPassword,
  validateSession,
  hasRole,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  type Role,
} from './auth.js';
import { collectStatus } from './status.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: number; role: Role };
  }
}

export interface ServerDeps {
  db: Db;
  sessionTtlMs?: number;
  /** 計算磁碟用量的資料目錄（僅供 statfs，不外洩路徑）。 */
  dataDir?: string;
  appVersion?: string;
  /** Cookie 簽章金鑰（ADR-008；由 entrypoint 自 0600 secrets 檔/env 注入，不入映像）。 */
  cookieSecret?: string;
  /** 內網 TLS（ADR-008）；提供則以 HTTPS 監聽，否則 HTTP（由前置反代/部署決定）。 */
  https?: { key: string | Buffer; cert: string | Buffer };
  /** 內建靜態服務 web SPA 的目錄（如映像內 packages/web/dist）；提供則同容器服務 Portal（DEPLOY_SPEC §1）。 */
  webDir?: string;
  /** TLS 憑證路徑（供 /api/status 計算剩餘天數；僅讀 notAfter，不外洩內容）。 */
  tlsCertPath?: string;
}

/** 目前唯一被程式碼消費的設定鍵；PUT 僅接受此清單內的鍵（防注入任意 settings 列）。 */
const ALLOWED_SETTINGS_KEYS = new Set(['scan_whitelist']);

// 排程間隔界線（ADR-010：不低於輪詢粒度，避免 enqueue 風暴；上限 1 年）。
const MIN_INTERVAL_SECONDS = 300;
const MAX_INTERVAL_SECONDS = 31_536_000;

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * 同容器服務 web SPA：以 setNotFoundHandler 處理所有非 /api、非 /healthz 的 GET。
 * 路徑安全：resolve 後須仍在 webDir 內；命中實體檔則回該檔，否則回 index.html（SPA fallback）。
 */
function registerStatic(app: FastifyInstance, webDir: string): void {
  const indexHtml = resolve(webDir, 'index.html');
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api') || req.url === '/healthz') {
      void reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
      return;
    }
    const urlPath = (req.url.split('?')[0] ?? '/').replace(/^\/+/, '');
    const candidate = resolve(webDir, urlPath || 'index.html');
    const safe = candidate === webDir || candidate.startsWith(webDir + '/');
    const file =
      safe && existsSync(candidate) && statSync(candidate).isFile() ? candidate : indexHtml;
    void reply.type(STATIC_MIME[extname(file)] ?? 'application/octet-stream').send(readFileSync(file));
  });
}

function getWhitelist(db: Db): string[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'scan_whitelist'").get() as
    | { value: string }
    | undefined;
  return row ? row.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * 白名單條目格式檢查（第一道閘）。只接受裸主機/網域或 IPv4；
 * 禁 scheme/port/path/萬用字元/空白、以及 loopback/link-local（出站層一律封鎖，列入無意義）。
 * 真正的 SSRF 邊界仍是掃描時的每請求 egress 強制（ADR-009），此處僅防呆與防注入。
 */
export function isValidWhitelistHost(raw: string): boolean {
  const e = raw.trim().toLowerCase();
  if (!e) return false;
  if (/[\s/*@?#]/.test(e) || e.includes(':')) return false;
  if (e === 'localhost' || e.endsWith('.localhost')) return false;
  if (/^127\./.test(e) || e === '0.0.0.0' || /^169\.254\./.test(e)) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(e);
}

function isTargetAllowed(target: string, whitelist: string[]): boolean {
  try {
    const host = new URL(target).hostname;
    return whitelist.some((e) => host === e || host.endsWith(`.${e}`));
  } catch {
    return false;
  }
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { db } = deps;
  // https 於執行期附掛（保持 instance 為預設 HTTP/1 型別，避免 http2-secure 推斷污染所有 handler 型別）。
  const serverOpts: FastifyServerOptions = { logger: false };
  if (deps.https) (serverOpts as FastifyServerOptions & { https: unknown }).https = deps.https;
  const app = Fastify(serverOpts);
  // Cookie 簽章金鑰（ADR-008）；未提供時退回未簽章（session 以 DB token 驗證仍安全，測試用）。
  void app.register(cookie, deps.cookieSecret ? { secret: deps.cookieSecret } : {});
  void app.register(swagger, {
    openapi: { info: { title: 'Accessify API', version: '1.0.0' } },
  });

  const tokenOf = (req: FastifyRequest): string | null => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    const c = req.cookies?.session;
    return typeof c === 'string' ? c : null;
  };

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = tokenOf(req);
    const sess = token ? validateSession(db, token) : null;
    if (!sess) {
      await reply.code(401).send({ code: 'unauthorized', messageKey: 'error.unauthorized' });
      return;
    }
    req.user = sess;
  };

  const requireRole =
    (role: Role) =>
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!req.user || !hasRole(req.user.role, role)) {
        await reply.code(403).send({ code: 'forbidden', messageKey: 'error.forbidden' });
        return;
      }
    };

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/api/openapi.json', async () => app.swagger());

  app.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: { username: { type: 'string' }, password: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { username, password } = req.body as { username: string; password: string };
      const r = await authenticate(db, username, password);
      if (!r.ok) {
        writeAudit(db, { action: 'auth.login.fail', resource: `user:${username}` });
        return reply.code(401).send({ code: 'invalid', messageKey: 'error.login' });
      }
      const token = createSession(db, r.userId!, deps.sessionTtlMs ?? 30 * 60_000);
      writeAudit(db, { userId: r.userId, action: 'auth.login', resource: `user:${r.userId}` });
      void reply.setCookie('session', token, { httpOnly: true, sameSite: 'strict', path: '/' });
      return { token, role: r.role, mustChangePassword: r.mustChangePassword };
    },
  );

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const token = tokenOf(req);
    if (token) destroySession(db, token);
    void reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });

  // ── 自助變更密碼（T801 / FR-101 / ADR-006）──
  // 政策檢查於 handler（非 JSON schema）以回傳 i18n messageKey；上限 72 避開 bcrypt 截斷。
  // 錯誤 currentPassword 內部走 authenticate 的鎖定計數，杜絕持 token 者的線上猜密。
  app.post(
    '/api/auth/change-password',
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      const userId = req.user!.userId;
      const u = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as {
        username: string;
      };
      if (
        newPassword.length < PASSWORD_MIN_LENGTH ||
        newPassword.length > PASSWORD_MAX_LENGTH ||
        newPassword.toLowerCase() === u.username.toLowerCase()
      ) {
        return reply.code(400).send({ code: 'password_policy', messageKey: 'error.passwordPolicy' });
      }
      if (newPassword === currentPassword) {
        return reply.code(400).send({ code: 'password_same', messageKey: 'error.passwordSame' });
      }
      const r = await changePassword(db, userId, currentPassword, newPassword);
      if (!r.ok) {
        writeAudit(db, { userId, action: 'auth.change_password.fail', resource: `user:${userId}` });
        return r.reason === 'locked'
          ? reply.code(401).send({ code: 'locked', messageKey: 'error.accountLocked' })
          : reply.code(401).send({ code: 'invalid', messageKey: 'error.wrongPassword' });
      }
      destroyOtherSessions(db, userId, tokenOf(req)!);
      writeAudit(db, { userId, action: 'auth.change_password', resource: `user:${userId}` });
      return { ok: true };
    },
  );

  // ── 帳號管理（T802 / FR-101/102/104 / ADR-006）：全 admin、全稽核。──
  // 不支援硬刪：users.id 為 scan_tasks/schedules/audit_logs 之 FK（無 ON DELETE），且稽核完整性要求保留；以停用取代。
  app.get('/api/users', { preHandler: [requireAuth, requireRole('admin')] }, async () => {
    const rows = db
      .prepare(
        `SELECT id, username, role, status, locked_until, must_change_password, created_at
         FROM users ORDER BY id`,
      )
      .all() as Array<{
      id: number;
      username: string;
      role: Role;
      status: string;
      locked_until: string | null;
      must_change_password: number;
      created_at: string;
    }>;
    const now = new Date().toISOString();
    // 絕不回傳 password_hash；locked_until 轉為布林（前端不需要精確到期時間）
    return rows.map(({ locked_until: lockedUntil, ...u }) => ({
      ...u,
      locked: lockedUntil != null && lockedUntil > now,
    }));
  });

  app.post(
    '/api/users',
    {
      preHandler: [requireAuth, requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['username', 'role'],
          properties: {
            username: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'viewer'] },
            password: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { username, role, password } = req.body as {
        username: string;
        role: Role;
        password?: string;
      };
      // username 格式於 handler 檢查以回傳 i18n messageKey
      if (!/^[a-z0-9._-]{1,64}$/i.test(username)) {
        return reply.code(400).send({ code: 'invalid_username', messageKey: 'error.invalidUsername' });
      }
      if (
        password !== undefined &&
        (password.length < PASSWORD_MIN_LENGTH ||
          password.length > PASSWORD_MAX_LENGTH ||
          password.toLowerCase() === username.toLowerCase())
      ) {
        return reply.code(400).send({ code: 'password_policy', messageKey: 'error.passwordPolicy' });
      }
      const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
      if (exists) {
        return reply.code(409).send({ code: 'user_exists', messageKey: 'error.userExists' });
      }
      // 未指定密碼 → 產生一次性密碼（僅於本回應出現一次），並強制首次登入改密
      const generated = password === undefined ? generateOneTimePassword() : undefined;
      const id = await createUser(db, {
        username,
        password: password ?? generated!,
        role,
        mustChangePassword: password === undefined,
      });
      // 稽核僅記角色，絕不寫入任何密碼內容
      writeAudit(db, {
        userId: req.user!.userId,
        action: 'user.create',
        resource: `user:${id}`,
        detail: `role=${role}`,
      });
      return reply.code(201).send({ id, username, ...(generated ? { generatedPassword: generated } : {}) });
    },
  );

  app.put(
    '/api/users/:id',
    {
      preHandler: [requireAuth, requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['admin', 'viewer'] },
            status: { type: 'string', enum: ['active', 'disabled'] },
          },
        },
      },
    },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      const { role, status } = req.body as { role?: Role; status?: string };
      const target = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(id) as
        | { id: number; role: Role; status: string }
        | undefined;
      if (!target) {
        return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
      }
      // 不可自我管理（改自己密碼走 change-password；角色/狀態由另一位 admin 管理），
      // 並與 requireRole(admin) 共同保證「至少一位 active admin」不變量。
      if (id === req.user!.userId) {
        return reply.code(400).send({ code: 'self_manage', messageKey: 'error.selfManage' });
      }
      // 防禦縱深：降級/停用「最後一位 active admin」→ 409（正常路徑已被 selfManage 擋下）
      const demoting = target.role === 'admin' && target.status === 'active' && (role === 'viewer' || status === 'disabled');
      if (demoting) {
        const others = db
          .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active' AND id != ?")
          .get(id) as { c: number };
        if (others.c === 0) {
          return reply.code(409).send({ code: 'last_admin', messageKey: 'error.lastAdmin' });
        }
      }
      const changed: string[] = [];
      if (role !== undefined && role !== target.role) {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
        changed.push(`role=${role}`);
      }
      if (status !== undefined && status !== target.status) {
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
        changed.push(`status=${status}`);
        // 停用立即註銷該使用者全部 session（validateSession 另有 status 檢查作縱深）
        if (status === 'disabled') destroyUserSessions(db, id);
      }
      writeAudit(db, {
        userId: req.user!.userId,
        action: 'user.update',
        resource: `user:${id}`,
        detail: changed.join(',') || null,
      });
      return { ok: true };
    },
  );

  app.post(
    '/api/users/:id/reset-password',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as { id: number } | undefined;
      if (!target) {
        return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
      }
      if (id === req.user!.userId) {
        return reply.code(400).send({ code: 'self_manage', messageKey: 'error.selfManage' });
      }
      // 產生一次性密碼（僅於本回應出現一次）、強制下次登入改密；
      // 同時清鎖定/失敗計數（兼作解鎖機制）並註銷該使用者全部 session。
      const generated = generateOneTimePassword();
      const hash = await hashPassword(generated);
      db.prepare(
        'UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      ).run(hash, id);
      destroyUserSessions(db, id);
      writeAudit(db, { userId: req.user!.userId, action: 'user.reset_password', resource: `user:${id}` });
      return { generatedPassword: generated };
    },
  );

  app.get('/api/scans', { preHandler: requireAuth }, async () =>
    db.prepare('SELECT id, target, type, status, created_at FROM scan_tasks ORDER BY id DESC').all(),
  );

  app.post(
    '/api/scans',
    {
      preHandler: [requireAuth, requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['target', 'type'],
          properties: { target: { type: 'string' }, type: { enum: ['url', 'sitemap'] } },
        },
      },
    },
    async (req, reply) => {
      const { target, type } = req.body as { target: string; type: 'url' | 'sitemap' };
      if (!isTargetAllowed(target, getWhitelist(db))) {
        return reply.code(400).send({ code: 'not_whitelisted', messageKey: 'error.notWhitelisted' });
      }
      const taskId = Number(
        db
          .prepare("INSERT INTO scan_tasks (target, type, status, created_by) VALUES (?, ?, 'queued', ?)")
          .run(target, type, req.user!.userId).lastInsertRowid,
      );
      enqueueJob(db, taskId);
      writeAudit(db, { userId: req.user!.userId, action: 'scan.create', resource: `scan_task:${taskId}` });
      return reply.code(201).send({ id: taskId, status: 'queued' });
    },
  );

  app.get('/api/scans/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const task = db.prepare('SELECT id, target, type, status, created_at FROM scan_tasks WHERE id = ?').get(id);
    if (!task) return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    const issueCounts = db
      .prepare(
        `SELECT i.severity AS severity, COUNT(*) AS count FROM issues i
         JOIN pages p ON p.id = i.page_id WHERE p.scan_task_id = ? GROUP BY i.severity`,
      )
      .all(id);
    return { ...task, issueCounts };
  });

  app.get('/api/scans/:id/issues', { preHandler: requireAuth }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    return db
      .prepare(
        `SELECT i.id, i.engine, i.rule_code, i.wcag_ref, i.severity, i.selector, i.message
         FROM issues i JOIN pages p ON p.id = i.page_id WHERE p.scan_task_id = ? ORDER BY i.id`,
      )
      .all(id);
  });

  app.get('/api/scans/:id/reports', { preHandler: requireAuth }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    return db.prepare('SELECT id, lang, format, created_at FROM reports WHERE scan_task_id = ? ORDER BY id').all(id);
  });

  // 掃描差異（FR-502）：與同 target 前次 completed 掃描比對；baseline 由後端決定，不接受呼叫端指定（防跨 target 列舉）。
  app.get('/api/scans/:id/diff', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!db.prepare('SELECT 1 FROM scan_tasks WHERE id = ?').get(id)) {
      return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    }
    return computeDiff(db, id);
  });

  const REPORT_MIME: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  // 報表檔案下載（FR-404）。同源 httpOnly session cookie 即可授權，<a download> 直接命中。
  app.get('/api/reports/:id/download', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const row = db
      .prepare('SELECT format, path FROM reports WHERE id = ?')
      .get(id) as { format: string; path: string } | undefined;
    if (!row) return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    let content: Buffer;
    try {
      content = readFileSync(row.path);
    } catch {
      return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    }
    writeAudit(db, { userId: req.user!.userId, action: 'report.download', resource: `report:${id}` });
    return reply
      .header('content-type', REPORT_MIME[row.format] ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${basename(row.path)}"`)
      .send(content);
  });

  // 系統狀態（FR / ADR-011）。viewer 即可（admin 為超集）；僅派生值，不洩漏路徑/主機/密鑰。
  app.get('/api/status', { preHandler: [requireAuth, requireRole('viewer')] }, async () =>
    collectStatus(db, { dataDir: deps.dataDir, appVersion: deps.appVersion, tlsCertPath: deps.tlsCertPath }),
  );

  app.get('/api/settings', { preHandler: [requireAuth, requireRole('admin')] }, async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/api/settings', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const body = { ...((req.body as Record<string, unknown>) ?? {}) };
    // 只接受已知鍵（防注入任意 settings 列）。
    for (const k of Object.keys(body)) {
      if (!ALLOWED_SETTINGS_KEYS.has(k)) {
        return reply.code(400).send({ code: 'invalid_key', messageKey: 'error.unknown' });
      }
    }
    // scan_whitelist：逐項驗證主機格式並正規化（trim）。出站層為最終 SSRF 邊界（ADR-009）。
    const changed: string[] = [];
    if ('scan_whitelist' in body) {
      const hosts = String(body.scan_whitelist ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (hosts.some((h) => !isValidWhitelistHost(h))) {
        return reply.code(400).send({ code: 'invalid_whitelist', messageKey: 'error.invalidWhitelist' });
      }
      body.scan_whitelist = hosts.join(',');
      changed.push('scan_whitelist');
    }
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    const apply = db.transaction((entries: [string, unknown][]) => {
      for (const [k, v] of entries) upsert.run(k, String(v));
    });
    apply(Object.entries(body));
    // 僅記錄變更的「鍵名」，不寫入任何值（避免敏感資訊入稽核）。
    writeAudit(db, { userId: req.user!.userId, action: 'settings.update', detail: changed.join(',') || null });
    return { ok: true };
  });

  // ── 排程重掃（T601 / FR-501 / ADR-010）。列表 viewer 可讀；新增/修改/刪除限 admin。 ──
  app.get('/api/schedules', { preHandler: requireAuth }, async () =>
    db
      .prepare(
        'SELECT id, target, type, interval_seconds, enabled, last_run_at, next_run_at, created_at FROM schedules ORDER BY id',
      )
      .all(),
  );

  app.post(
    '/api/schedules',
    {
      preHandler: [requireAuth, requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['target', 'type', 'interval_seconds'],
          properties: {
            target: { type: 'string', minLength: 1 },
            type: { type: 'string', enum: ['url', 'sitemap'] },
            interval_seconds: { type: 'integer' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { target, type, interval_seconds, enabled } = req.body as {
        target: string;
        type: 'url' | 'sitemap';
        interval_seconds: number;
        enabled?: boolean;
      };
      if (interval_seconds < MIN_INTERVAL_SECONDS || interval_seconds > MAX_INTERVAL_SECONDS) {
        return reply.code(400).send({ code: 'invalid_interval', messageKey: 'error.invalidInterval' });
      }
      if (!isTargetAllowed(target, getWhitelist(db))) {
        return reply.code(400).send({ code: 'not_whitelisted', messageKey: 'error.notWhitelisted' });
      }
      const nextRun = new Date(Date.now() + interval_seconds * 1000).toISOString();
      let id: number;
      try {
        id = Number(
          db
            .prepare(
              'INSERT INTO schedules (target, type, interval_seconds, enabled, next_run_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(target, type, interval_seconds, enabled === false ? 0 : 1, nextRun, req.user!.userId)
            .lastInsertRowid,
        );
      } catch (e) {
        if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return reply.code(409).send({ code: 'schedule_exists', messageKey: 'error.scheduleExists' });
        }
        throw e;
      }
      writeAudit(db, { userId: req.user!.userId, action: 'schedule.create', resource: `schedule:${id}` });
      return reply.code(201).send({ id });
    },
  );

  app.put(
    '/api/schedules/:id',
    {
      preHandler: [requireAuth, requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: { enabled: { type: 'boolean' }, interval_seconds: { type: 'integer' } },
        },
      },
    },
    async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!db.prepare('SELECT 1 FROM schedules WHERE id = ?').get(id)) {
        return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
      }
      const body = req.body as { enabled?: boolean; interval_seconds?: number };
      if (body.interval_seconds !== undefined) {
        if (body.interval_seconds < MIN_INTERVAL_SECONDS || body.interval_seconds > MAX_INTERVAL_SECONDS) {
          return reply.code(400).send({ code: 'invalid_interval', messageKey: 'error.invalidInterval' });
        }
        const nextRun = new Date(Date.now() + body.interval_seconds * 1000).toISOString();
        db.prepare('UPDATE schedules SET interval_seconds = ?, next_run_at = ? WHERE id = ?').run(
          body.interval_seconds,
          nextRun,
          id,
        );
      }
      if (body.enabled !== undefined) {
        db.prepare('UPDATE schedules SET enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, id);
      }
      writeAudit(db, { userId: req.user!.userId, action: 'schedule.update', resource: `schedule:${id}` });
      return { ok: true };
    },
  );

  app.delete('/api/schedules/:id', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const r = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    if (r.changes === 0) return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    writeAudit(db, { userId: req.user!.userId, action: 'schedule.delete', resource: `schedule:${id}` });
    return { ok: true };
  });

  // 同容器靜態服務 web SPA（DEPLOY_SPEC §1；dep-free、path-safe）。/api 與 /healthz 維持原行為。
  if (deps.webDir) {
    registerStatic(app, resolve(deps.webDir));
  }

  // ── 站內通知（T603 / FR-503）。一律 requireAuth；僅能存取「本人」的通知（user 範圍）。 ──
  app.get('/api/notifications', { preHandler: requireAuth }, async (req) =>
    listNotifications(db, req.user!.userId),
  );
  app.get('/api/notifications/unread-count', { preHandler: requireAuth }, async (req) => ({
    count: unreadCount(db, req.user!.userId),
  }));
  app.post('/api/notifications/read-all', { preHandler: requireAuth }, async (req) => ({
    updated: markAllRead(db, req.user!.userId),
  }));
  app.post('/api/notifications/:id/read', { preHandler: requireAuth }, async (req, reply) => {
    const ok = markRead(db, Number((req.params as { id: string }).id), req.user!.userId);
    if (!ok) return reply.code(404).send({ code: 'not_found', messageKey: 'error.notFound' });
    return { ok: true };
  });

  return app;
}
