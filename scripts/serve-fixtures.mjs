#!/usr/bin/env node
// 部署驗收用基準 fixture 站台（含已知無障礙缺陷）。供現場 e2e：以非 loopback 主機名 'fixtures'
// 在 compose 網路提供（loopback 受 egress 永久封鎖），由 worker 經白名單掃描。
// 用法：node scripts/serve-fixtures.mjs [port]   （預設 8080）
import http from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const HTML = `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>Accessify fixture</title></head>
<body>
  <img src="logo.png">
  <button></button>
  <input type="text">
  <p style="color:#bbb;background:#ccc">低對比文字</p>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});
server.listen(PORT, () => console.log(`[fixtures] serving accessibility fixture on :${PORT}`));
