// 極簡 hash router（無外部相依；離線/穩定優先）。
// 路由值為 location.hash（去掉前綴 #），以 useSyncExternalStore 訂閱 hashchange。

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function snapshot(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h === '' ? '/' : h;
}

/** 目前路由路徑（如 `/`、`/scans/new`、`/scans/12`）。 */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
}

/** 程式化導向。 */
export function navigate(path: string): void {
  window.location.hash = path;
}
