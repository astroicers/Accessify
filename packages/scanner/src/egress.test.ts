import { describe, it, expect } from 'vitest';
import { evaluate, isBlockedIp, type EgressPolicy } from './egress.js';

const policy: EgressPolicy = { whitelist: ['intra.mil', '10.20.0.5'] };

describe('egress 白名單 / SSRF 政策（ADR-009）', () => {
  it('允許白名單網域與其子網域', () => {
    expect(evaluate('https://intra.mil/page', policy).allowed).toBe(true);
    expect(evaluate('https://app.intra.mil/x', policy).allowed).toBe(true);
    expect(evaluate('https://intra.mil:8443/x', policy).allowed).toBe(true);
  });

  it('封鎖非白名單主機', () => {
    const d = evaluate('https://evil.example/', policy);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('not-whitelisted');
  });

  it('允許白名單內的內網私有 IP（intranet）', () => {
    expect(evaluate('http://10.20.0.5/', policy).allowed).toBe(true);
  });

  it('封鎖未列白名單的私有 IP', () => {
    expect(evaluate('http://10.0.0.9/', policy).allowed).toBe(false);
    expect(evaluate('http://192.168.1.1/', policy).allowed).toBe(false);
  });

  it('封鎖非 http(s) 協定（file/data/about）', () => {
    expect(evaluate('file:///etc/passwd', policy).reason).toMatch(/^protocol:/);
    expect(evaluate('data:text/html,x', policy).allowed).toBe(false);
    expect(evaluate('about:blank', policy).allowed).toBe(false);
  });

  it('loopback / link-local / 雲 metadata / 0.0.0.0 一律封鎖（即使被列入白名單）', () => {
    expect(evaluate('http://127.0.0.1/', { whitelist: ['127.0.0.1'] }).allowed).toBe(false);
    expect(evaluate('http://[::1]/', { whitelist: ['::1'] }).allowed).toBe(false);
    expect(evaluate('http://169.254.169.254/latest/meta-data', { whitelist: ['169.254.169.254'] }).allowed).toBe(
      false,
    );
    expect(evaluate('http://0.0.0.0/', { whitelist: ['0.0.0.0'] }).allowed).toBe(false);
  });

  it('redirect 後的 URL 以同一政策重新校驗（封鎖跳到非白名單）', () => {
    // 攔截層會對 redirect 後最終 URL 再呼叫 evaluate
    expect(evaluate('http://169.254.169.254/', policy).allowed).toBe(false);
    expect(evaluate('https://evil.example/', policy).allowed).toBe(false);
  });

  it('isBlockedIp：loopback/link-local/this-network 為真；一般私有/公開為偽', () => {
    expect(isBlockedIp('127.0.0.5')).toBe(true);
    expect(isBlockedIp('169.254.10.1')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('10.20.0.5')).toBe(false);
    expect(isBlockedIp('192.168.1.1')).toBe(false);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
  });
});
