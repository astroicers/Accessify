// @accessify/api/server — REST API（T502 / FR-206 / ADR-001）
// Fastify + session 中介層 + RBAC 守衛 + route schema（即契約）+ OpenAPI。DI 以利 inject 測試。

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import { enqueueJob, writeAudit, type Db } from '@accessify/core';
import {
  authenticate,
  createSession,
  destroySession,
  validateSession,
  hasRole,
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
}

/** 目前唯一被程式碼消費的設定鍵；PUT 僅接受此清單內的鍵（防注入任意 settings 列）。 */
const ALLOWED_SETTINGS_KEYS = new Set(['scan_whitelist']);

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
  const app = Fastify({ logger: false });
  void app.register(cookie);
  void app.register(swagger, {
    openapi: { info: { title: 'Accessify API', version: '0.1.0' } },
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
    collectStatus(db, { dataDir: deps.dataDir, appVersion: deps.appVersion }),
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

  return app;
}
