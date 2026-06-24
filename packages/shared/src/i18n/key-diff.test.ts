import { describe, it, expect } from 'vitest';
import zhTW from '../../locales/zh-TW.json';
import enUS from '../../locales/en-US.json';

// CI 閘（ADR-004，T006）：zh-TW 與 en-US catalog 的 key 集合必須完全一致。
// 此測試於 `npm test`（CI）執行 → 雙語 key 漂移即 fail。

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flatKeys(v as Record<string, unknown>, key)
      : [key];
  });
}

describe('i18n 雙語 key 對齊（ADR-004 · T006 CI 閘）', () => {
  it('zh-TW 與 en-US 的 key 集合完全一致（無缺漏 / 無多餘）', () => {
    const zh = flatKeys(zhTW).sort();
    const en = flatKeys(enUS).sort();
    const missingInEn = zh.filter((k) => !en.includes(k));
    const missingInZh = en.filter((k) => !zh.includes(k));
    expect(missingInEn, `en-US 缺少 key：${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInZh, `zh-TW 缺少 key：${missingInZh.join(', ')}`).toEqual([]);
    expect(zh.length).toBeGreaterThan(0);
  });
});
