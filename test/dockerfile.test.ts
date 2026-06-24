import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 結構測試：守住 air-gap 基礎映像的硬性需求（ADR-002 / ADR-009）。
// 不在此跑 docker build（需 docker + 網路抓 base/Chromium/字型，屬 CI/現場步驟）。
const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');

describe('base 映像 air-gap 結構（ADR-002/009）', () => {
  it('Node 版本 pin（node:22）', () => {
    expect(dockerfile).toMatch(/FROM node:22/);
  });

  it('內建 CJK 字型（報表 PDF 完整字型）', () => {
    expect(dockerfile).toContain('fonts-noto-cjk');
  });

  it('tini 做 PID1 reaping（ADR-009）', () => {
    expect(dockerfile).toMatch(/\btini\b/);
    expect(dockerfile).toContain('ENTRYPOINT ["tini"');
  });

  it('非 root 執行（ADR-009 sandbox）', () => {
    expect(dockerfile).toContain('useradd');
    expect(dockerfile).toMatch(/USER\s+accessify/);
  });

  it('相依以 lockfile pin（npm ci），無未鎖定的 npm install', () => {
    expect(dockerfile).toContain('npm ci');
    expect(dockerfile).not.toMatch(/RUN[^\n]*npm install/);
  });

  it('容器時區 Asia/Taipei（ADR-010）', () => {
    expect(dockerfile).toContain('TZ=Asia/Taipei');
  });

  it('Chromium 所需 OS 函式庫已於 base 內建（執行期不再 apt）', () => {
    expect(dockerfile).toContain('libnss3');
    // apt 清單清理只應出現在建置層；執行期 runtime 不得 apt-get install
    const runtimeStage = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    expect(runtimeStage).not.toMatch(/apt-get\s+install/);
  });

  it('.dockerignore 排除 node_modules / .git / docs / .env / 執行期資料', () => {
    for (const p of ['node_modules', '.git', 'docs', '.env', 'data', 'reports']) {
      expect(dockerignore).toContain(p);
    }
  });
});
