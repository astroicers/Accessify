// @accessify/api/main — API 程序入口（T701）。
// 開 DB → 套遷移 → 首啟 bootstrap admin（一次性密碼）→ buildServer（含 SPA/TLS/cookie 金鑰）→ 監聽。
// 機密一律由 env 或 0600 secrets 檔注入，絕不入映像（ADR-008）；secrets 缺檔時降級不崩潰（首啟前可先起）。

import { readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb, runMigrations } from '@accessify/core';
import { buildServer } from './server.js';
import { ensureAdmin } from './bootstrap.js';

/** env 值優先；否則讀 *_FILE（須存在）；皆無回 undefined。缺檔僅警告不丟錯（值本身不入 log）。 */
function fromEnvOrFile(valEnv: string, fileEnv: string): string | undefined {
  const v = process.env[valEnv];
  if (v) return v;
  const f = process.env[fileEnv];
  if (!f) return undefined;
  if (!existsSync(f)) {
    console.warn(`[api] ${fileEnv} set but file not found (${f}) — skipping`);
    return undefined;
  }
  return readFileSync(f, 'utf8').trim();
}

/** 須 cert+key 皆存在才啟用 HTTPS；任一缺/僅其一 → 降級 HTTP（不崩潰）。 */
function readTls(): { cert: Buffer; key: Buffer } | undefined {
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;
  if (!certPath && !keyPath) return undefined;
  if (!certPath || !keyPath || !existsSync(certPath) || !existsSync(keyPath)) {
    console.warn('[api] TLS cert/key incomplete or missing — serving plain HTTP');
    return undefined;
  }
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

async function main(): Promise<void> {
  const dbPath = process.env.ACCESSIFY_DB_PATH;
  if (!dbPath) {
    console.error('[api] ACCESSIFY_DB_PATH is required');
    process.exit(1);
    return;
  }

  const db = openDb(dbPath, { busyTimeoutMs: Number(process.env.BUSY_TIMEOUT_MS ?? '5000') });
  runMigrations(db);

  // 首啟建立 admin；未提供密碼則產生一次性隨機密碼並強制首登改密（ADR-006）。
  const { generatedPassword } = await ensureAdmin(db, { username: process.env.ADMIN_USERNAME });
  if (generatedPassword) {
    console.log(`[api] initial admin password (one-time, change on first login): ${generatedPassword}`);
  }

  const https = readTls();
  const server = buildServer({
    db,
    dataDir: dirname(dbPath),
    appVersion: process.env.APP_VERSION ?? '1.0.0',
    sessionTtlMs: process.env.SESSION_TIMEOUT_MIN
      ? Number(process.env.SESSION_TIMEOUT_MIN) * 60_000
      : undefined,
    cookieSecret: fromEnvOrFile('COOKIE_SECRET', 'COOKIE_SECRET_FILE'),
    https,
    webDir: process.env.ACCESSIFY_WEB_DIR,
    tlsCertPath: process.env.TLS_CERT_PATH,
  });

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? '8443');
  await server.listen({ host, port });
  console.log(`[api] listening on ${https ? 'https' : 'http'}://${host}:${port}`);
}

void main().catch((e: unknown) => {
  console.error('[api] fatal', e);
  process.exit(1);
});
