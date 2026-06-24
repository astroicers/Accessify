// @accessify/scanner/findings — 跨引擎 finding 模型與整併去重（ADR-007 / FR-203）

export type Engine = 'axe-core' | 'htmlcs';

/** 來自單一引擎的原始 finding。WCAG 對應/嚴重度分級於 mapping 套件（M2）。 */
export interface Finding {
  engine: Engine;
  ruleId: string;
  impact: string | null;
  /** 引擎原生 WCAG tag（如 axe 'wcag111'、HTMLCS '1_1_1'）。 */
  wcagTags: string[];
  selector: string;
  message: string;
  helpUrl?: string;
}

/** 整併後 finding：記錄回報此問題的引擎集合。 */
export interface MergedFinding extends Finding {
  engines: Engine[];
}

/** 將引擎原生 WCAG tag 正規化為標準 SC（如 '1.1.1'）；非 SC（level/分類）回 null。 */
export function toSuccessCriterion(tag: string): string | null {
  let m = /^wcag(\d)(\d)(\d+)$/.exec(tag); // axe: wcag111 / wcag1410
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = /^(\d+)[._](\d+)[._](\d+)$/.exec(tag); // HTMLCS: 1_1_1 / 1.1.1
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return null;
}

function scSet(f: Finding): string[] {
  return [...new Set(f.wcagTags.map(toSuccessCriterion).filter((x): x is string => x !== null))].sort();
}

/** 去重鍵：WCAG SC 集合 + selector（跨引擎同問題 → 合併）；無 SC 時退回 ruleId + selector。 */
function dedupKey(f: Finding): string {
  const sc = scSet(f);
  const head = sc.length > 0 ? sc.join('|') : `rule:${f.ruleId}`;
  return `${head}::${f.selector}`;
}

/**
 * 整併多引擎 findings 並去重：同 WCAG SC + selector 視為同一問題，
 * 合併並記錄回報的引擎集合（兩引擎都抓到 → engines: ['axe-core','htmlcs']）。
 */
export function mergeFindings(...lists: Finding[][]): MergedFinding[] {
  const map = new Map<string, MergedFinding>();
  for (const list of lists) {
    for (const f of list) {
      const k = dedupKey(f);
      const existing = map.get(k);
      if (existing) {
        if (!existing.engines.includes(f.engine)) existing.engines.push(f.engine);
      } else {
        map.set(k, { ...f, engines: [f.engine] });
      }
    }
  }
  return [...map.values()];
}
