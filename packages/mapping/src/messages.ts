// @accessify/mapping/messages — 引擎訊息在地化（zh-TW）。
// axe-core / HTML_CodeSniffer 原樣輸出英文；報表「說明」欄需中文（CLAUDE.md 強制 i18n、雙語報表）。
// 策略（誠實、可擴充）：常見規則以技術碼/規則 id 比對 → 精準 zh-TW；未涵蓋者以 WCAG 準則中文名兜底；
// en-US 維持引擎原文（英文即正確內容）。比對涵蓋 axe id 與 HTMLCS 技術碼（如 .H37 / F68 / ARIA4）。

import type { Locale } from '@accessify/shared';

interface MessageRule {
  test: RegExp; // 比對 axe ruleId 或 HTMLCS code（含技術碼片段）
  zh: string;
}

// 順序敏感：先特定後通用（label/name、ARIA 較廣，置後）。
const MESSAGE_RULES: MessageRule[] = [
  { test: /(^|\b)image-alt\b|\.H37\b/i, zh: '影像缺少替代文字（alt）：有意義的影像請提供描述性 alt，裝飾性影像請用空 alt（alt=""）。' },
  { test: /(^|\b)link-name\b|\.H30\b/i, zh: '連結缺少可辨識文字：請提供能描述連結目的的文字，避免僅以圖示或「點此」呈現。' },
  { test: /(^|\b)button-name\b/i, zh: '按鈕缺少可存取名稱：請提供按鈕文字或 aria-label。' },
  { test: /(^|\b)color-contrast\b|\.G18\b|\.G145\b/i, zh: '文字與背景對比不足：請提高對比至 WCAG AA（一般文字 4.5:1、大型文字 3:1）。' },
  { test: /(^|\b)html-has-lang\b|(^|\b)html-lang-valid\b|\.H57\b/i, zh: '頁面缺少或語言宣告無效：請於 <html> 設定正確的 lang（例如 lang="zh-TW"）。' },
  { test: /(^|\b)document-title\b/i, zh: '頁面缺少標題：請提供描述性的 <title>。' },
  { test: /(^|\b)heading-order\b/i, zh: '標題層級跳階：標題應依序使用（h1→h2→…），不可跳級。' },
  { test: /(^|\b)empty-heading\b/i, zh: '標題內容為空：請移除空標題或補上文字。' },
  { test: /(^|\b)frame-title\b/i, zh: 'iframe 缺少 title：請提供能描述框架內容的 title。' },
  { test: /(^|\b)list\b|(^|\b)listitem\b/i, zh: '清單結構不正確：<ul>/<ol> 應直接且僅包含 <li>。' },
  { test: /\.F77\b|duplicate-id/i, zh: '出現重複的 id 屬性：id 必須唯一，否則會影響輔助技術的元素關聯。' },
  { test: /\.H32\b/i, zh: '表單缺少提交按鈕：請提供 type="submit" 的按鈕，確保可用鍵盤提交表單。' },
  { test: /\.H43\b|td-headers-attr|th-has-data-cells/i, zh: '資料表格缺少正確的表頭關聯：請以 <th> 搭配 scope 或 headers 正確關聯欄列。' },
  { test: /\.H91\b|(^|\b)label\b|\.F68\b/i, zh: '表單欄位缺少可存取名稱/標籤：請以 <label for> 關聯，或提供 aria-label / title。' },
  { test: /\.F92\b|ARIA\d|(^|\b)aria-/i, zh: 'ARIA 角色/屬性使用不當：請確認角色與屬性正確，避免覆蓋原生語意或隱藏應被讀取的內容。' },
];

/**
 * 將引擎 finding 的英文訊息在地化。
 * @param lang 報表語言
 * @param ruleId 引擎規則 id / HTMLCS 技術碼
 * @param scLocalizedName 對應 WCAG 準則的在地化名稱（兜底用；無則 null）
 * @param engineMessage 引擎原始（英文）訊息
 */
export function localizeFindingMessage(
  lang: Locale,
  ruleId: string,
  scLocalizedName: string | null,
  engineMessage: string,
): string {
  if (lang === 'en-US') return engineMessage; // 英文引擎訊息即為正確 en-US 內容
  for (const r of MESSAGE_RULES) {
    if (r.test.test(ruleId)) return r.zh;
  }
  if (scLocalizedName) {
    return `對應 WCAG 準則「${scLocalizedName}」，請人工檢視此元素是否符合（自動檢測未提供中文細節）。`;
  }
  return engineMessage; // 無對應準則時退回引擎原文（少數情況）
}
