// @accessify/scanner/htmlcs — HTML_CodeSniffer 注入與正規化（ADR-007 / FR-203）
// HTMLCS（BSD-3-Clause）以未修改之 build/HTMLCS.js 注入頁面執行；輸出正規化為 raw Finding。

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import type { Finding } from './findings.js';

const req = createRequire(import.meta.url);
const HTMLCS_SOURCE = readFileSync(req.resolve('html_codesniffer/build/HTMLCS.js'), 'utf8');

export interface RawHtmlcsMessage {
  /** 1=Error, 2=Warning, 3=Notice。 */
  type: number;
  code: string;
  msg: string;
  selector: string;
}

/** 由 HTMLCS code 取 WCAG SC：'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37' → '1_1_1'。 */
function scFromCode(code: string): string | null {
  const m = /(\d+_\d+_\d+)/.exec(code);
  return m ? m[1]! : null;
}

/** 將 HTMLCS 原始訊息正規化為 raw Finding（僅取 Error/type=1；純函式，便於單元測試）。 */
export function normalizeHtmlcs(messages: RawHtmlcsMessage[]): Finding[] {
  return messages
    .filter((m) => m.type === 1)
    .map((m) => {
      const sc = scFromCode(m.code);
      return {
        engine: 'htmlcs',
        ruleId: m.code,
        impact: null,
        wcagTags: sc ? [sc] : [],
        selector: m.selector,
        message: m.msg,
      } satisfies Finding;
    });
}

interface HtmlcsGlobal {
  process: (standard: string, doc: Document, done: () => void) => void;
  getMessages: () => { type: number; code: string; msg: string; element: Element }[];
}

/** 注入 HTMLCS 並對已渲染頁面執行，回傳正規化 findings。 */
export async function runHtmlcs(page: Page, standard = 'WCAG2AA'): Promise<Finding[]> {
  await page.addScriptTag({ content: HTMLCS_SOURCE });
  const raw = await page.evaluate((std): Promise<RawHtmlcsMessage[]> => {
    const cssPath = (el: Element | null): string => {
      if (!el || el.nodeType !== 1) return '';
      if (el.id) return `#${el.id}`;
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        const current: Element = node;
        let sel = current.nodeName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter(
            (c: Element) => c.nodeName === current.nodeName,
          );
          if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(current) + 1})`;
        }
        parts.unshift(sel);
        node = current.parentElement;
      }
      return parts.join(' > ') || 'html';
    };
    const htmlcs = (window as unknown as { HTMLCS: HtmlcsGlobal }).HTMLCS;
    return new Promise<RawHtmlcsMessage[]>((resolve) => {
      htmlcs.process(std, document, () => {
        resolve(
          htmlcs
            .getMessages()
            .map((m) => ({ type: m.type, code: m.code, msg: m.msg, selector: cssPath(m.element) })),
        );
      });
    });
  }, standard);
  return normalizeHtmlcs(raw);
}
