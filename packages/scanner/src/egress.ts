// @accessify/scanner/egress — 出站白名單 / SSRF 政策（ADR-009）
// 白名單為唯一允許來源；loopback/link-local/metadata/0.0.0.0 即使被列入白名單亦封鎖。
// 由 render 的 route 攔截層對「每個出站請求」與「redirect 後最終 URL」呼叫 evaluate。

export interface EgressPolicy {
  /** 允許的主機（網域或 IP）。網域比對含子網域；IP 為精確比對。 */
  whitelist: string[];
}

export interface EgressDecision {
  allowed: boolean;
  reason?: string;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** loopback / this-network / link-local（含雲 metadata 169.254.169.254）一律封鎖。
 *  一般私有網段（10/172.16/192.168、IPv6 ULA）不在此封鎖，由白名單把關（內網即私有）。 */
export function isBlockedIp(ip: string): boolean {
  const host = ip.replace(/^\[|\]$/g, '');
  if (host.includes(':')) {
    const low = host.toLowerCase();
    return low === '::1' || low === '::' || low.startsWith('fe80');
  }
  const octets = host.split('.').map((n) => Number(n));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 0) return true; // this-network / 0.0.0.0
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16（含 metadata）
  return false;
}

export function isHostWhitelisted(host: string, whitelist: string[]): boolean {
  const h = host.toLowerCase();
  return whitelist.some((entry) => {
    const e = entry.toLowerCase();
    return h === e || h.endsWith(`.${e}`);
  });
}

/** 對單一 URL 套用出站政策。redirect 後最終 URL 與每個 sub-resource 都應再呼叫一次。 */
export function evaluate(rawUrl: string, policy: EgressPolicy): EgressDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'invalid-url' };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { allowed: false, reason: `protocol:${url.protocol}` };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host) && isBlockedIp(host)) {
    return { allowed: false, reason: `blocked-ip:${host}` };
  }
  if (!isHostWhitelisted(host, policy.whitelist)) {
    return { allowed: false, reason: 'not-whitelisted' };
  }
  return { allowed: true };
}
