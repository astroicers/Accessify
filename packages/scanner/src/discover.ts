// @accessify/scanner/discover — URL / sitemap 目標探索（FR-204）

export type ScanInput =
  | { type: 'url'; value: string }
  | { type: 'sitemap'; sitemapXml: string };

/** 解析 sitemap.xml，取出 <loc> 中的 http(s) URL（去重）。 */
export function parseSitemap(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1]!.trim();
    if (/^https?:\/\//i.test(url)) out.push(url);
  }
  return [...new Set(out)];
}

/** 由輸入建立待掃描目標清單，並套用最大頁數上限（ADR-009 資源上限）。 */
export function buildTargets(input: ScanInput, maxPages = 200): string[] {
  const all = input.type === 'url' ? [input.value] : parseSitemap(input.sitemapXml);
  return all.slice(0, Math.max(0, maxPages));
}
