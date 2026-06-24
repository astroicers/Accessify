import { describe, it, expect } from 'vitest';
import { makeRouteHandler, type RouteLike, type BlockedRequest } from './render.js';

function mockRoute(url: string, log: { continued: string[]; aborted: string[] }): RouteLike {
  return {
    request: () => ({ url: () => url }),
    continue: () => log.continued.push(url),
    abort: () => log.aborted.push(url),
  };
}

describe('render route 攔截：每個出站請求強制 egress（ADR-009）', () => {
  it('白名單放行、非白名單與危險 IP abort 並記錄', () => {
    const log = { continued: [] as string[], aborted: [] as string[] };
    const blocked: BlockedRequest[] = [];
    const handler = makeRouteHandler({ whitelist: ['intra.mil'] }, blocked);

    handler(mockRoute('https://intra.mil/page', log));
    handler(mockRoute('https://app.intra.mil/style.css', log)); // 子網域 sub-resource
    handler(mockRoute('https://cdn.evil/x.js', log)); // 非白名單 sub-resource
    handler(mockRoute('http://169.254.169.254/latest/meta-data', log)); // 雲 metadata

    expect(log.continued).toEqual(['https://intra.mil/page', 'https://app.intra.mil/style.css']);
    expect(log.aborted).toEqual(['https://cdn.evil/x.js', 'http://169.254.169.254/latest/meta-data']);
    expect(blocked.map((b) => b.reason)).toContain('not-whitelisted');
    expect(blocked.some((b) => b.reason.startsWith('blocked-ip'))).toBe(true);
  });
});
