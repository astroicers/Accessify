// @accessify/api/server — REST API（T502 / FR-206 / ADR-001）
// Fastify + session 中介層 + RBAC 守衛 + route schema（即契約）+ OpenAPI。DI 以利 inject 測試。

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

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: number; role: Role };
  }
}

export interface ServerDeps {
  db: Db;
  sessionTtlMs?: number;
}

function getWhitelist(db: Db): string[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'scan_whitelist'").get() as
    | { value: string }
    | undefined;
  return row ? row.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
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

  app.get('/api/settings', { preHandler: [requireAuth, requireRole('admin')] }, async () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/api/settings', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const body = req.body as Record<string, unknown>;
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    const apply = db.transaction((entries: [string, unknown][]) => {
      for (const [k, v] of entries) upsert.run(k, String(v));
    });
    apply(Object.entries(body));
    writeAudit(db, { userId: req.user!.userId, action: 'settings.update' });
    return { ok: true };
  });

  return app;
}
