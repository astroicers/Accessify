// @accessify/mapping/wcag — 規則碼 → WCAG 準則對應（資料驅動，ADR-007 / FR-301）
// 引擎（axe/HTMLCS）的 WCAG tag 正規化為標準 SC，再查表取得等級、涵蓋類別與雙語名稱。

export type WcagLevel = 'A' | 'AA';
/** 自動涵蓋程度：auto=引擎可靠判定；partial=部分面向；manual=須人工。 */
export type CoverageClass = 'auto' | 'partial' | 'manual';

export interface WcagCriterion {
  sc: string;
  level: WcagLevel;
  coverage: CoverageClass;
  name: { 'zh-TW': string; 'en-US': string };
}

/** 將引擎原生 WCAG tag 正規化為標準 SC：axe 'wcag111' / HTMLCS '1_1_1' / '1.1.1' → '1.1.1'。 */
export function toSuccessCriterion(tag: string): string | null {
  let m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = /^(\d+)[._](\d+)[._](\d+)$/.exec(tag);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return null;
}

function c(
  sc: string,
  level: WcagLevel,
  coverage: CoverageClass,
  zh: string,
  en: string,
): WcagCriterion {
  return { sc, level, coverage, name: { 'zh-TW': zh, 'en-US': en } };
}

/** WCAG 2.0/2.1 A・AA 核心準則參考表（涵蓋引擎常報項目；可擴充）。 */
export const WCAG_CRITERIA: readonly WcagCriterion[] = [
  c('1.1.1', 'A', 'auto', '非文字內容', 'Non-text Content'),
  c('1.2.1', 'A', 'manual', '純音訊與純視訊（預錄）', 'Audio-only and Video-only (Prerecorded)'),
  c('1.2.2', 'A', 'manual', '字幕（預錄）', 'Captions (Prerecorded)'),
  c('1.3.1', 'A', 'partial', '資訊與關聯', 'Info and Relationships'),
  c('1.3.2', 'A', 'partial', '有意義的順序', 'Meaningful Sequence'),
  c('1.3.4', 'AA', 'auto', '方向', 'Orientation'),
  c('1.3.5', 'AA', 'partial', '識別輸入目的', 'Identify Input Purpose'),
  c('1.4.1', 'A', 'partial', '使用顏色', 'Use of Color'),
  c('1.4.2', 'A', 'manual', '音訊控制', 'Audio Control'),
  c('1.4.3', 'AA', 'auto', '對比（最低）', 'Contrast (Minimum)'),
  c('1.4.4', 'AA', 'partial', '調整文字大小', 'Resize Text'),
  c('1.4.5', 'AA', 'partial', '文字圖片', 'Images of Text'),
  c('1.4.10', 'AA', 'partial', '回流', 'Reflow'),
  c('1.4.11', 'AA', 'auto', '非文字對比', 'Non-text Contrast'),
  c('1.4.12', 'AA', 'partial', '文字間距', 'Text Spacing'),
  c('1.4.13', 'AA', 'manual', '懸停或聚焦時的內容', 'Content on Hover or Focus'),
  c('2.1.1', 'A', 'partial', '鍵盤', 'Keyboard'),
  c('2.1.2', 'A', 'manual', '無鍵盤陷阱', 'No Keyboard Trap'),
  c('2.4.1', 'A', 'partial', '略過區塊', 'Bypass Blocks'),
  c('2.4.2', 'A', 'auto', '頁面標題', 'Page Titled'),
  c('2.4.3', 'A', 'partial', '焦點順序', 'Focus Order'),
  c('2.4.4', 'A', 'partial', '連結目的（在脈絡中）', 'Link Purpose (In Context)'),
  c('2.4.6', 'AA', 'partial', '標題與標籤', 'Headings and Labels'),
  c('2.4.7', 'AA', 'partial', '焦點可見', 'Focus Visible'),
  c('3.1.1', 'A', 'auto', '頁面語言', 'Language of Page'),
  c('3.1.2', 'AA', 'auto', '部分語言', 'Language of Parts'),
  c('3.2.1', 'A', 'manual', '聚焦時', 'On Focus'),
  c('3.2.2', 'A', 'manual', '輸入時', 'On Input'),
  c('3.3.1', 'A', 'partial', '錯誤識別', 'Error Identification'),
  c('3.3.2', 'A', 'partial', '標籤或說明', 'Labels or Instructions'),
  c('4.1.1', 'A', 'auto', '解析', 'Parsing'),
  c('4.1.2', 'A', 'auto', '名稱、角色、值', 'Name, Role, Value'),
  c('4.1.3', 'AA', 'partial', '狀態訊息', 'Status Messages'),
];

const BY_SC = new Map(WCAG_CRITERIA.map((x) => [x.sc, x]));

/** 由標準 SC 取得準則資料；表外回 undefined（呼叫端應誠實標示為未知/須人工）。 */
export function resolveCriterion(sc: string): WcagCriterion | undefined {
  return BY_SC.get(sc);
}

/** 由引擎原生 wcag tags 解析出對應的 WCAG 準則（去重、表外略過）。 */
export function mapTagsToCriteria(wcagTags: string[]): WcagCriterion[] {
  const scs = new Set(
    wcagTags.map(toSuccessCriterion).filter((x): x is string => x !== null),
  );
  return [...scs].map(resolveCriterion).filter((x): x is WcagCriterion => x !== undefined);
}
