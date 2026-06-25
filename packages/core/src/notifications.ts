// @accessify/core/notifications — 站內通知（T603 / FR-503）
// 訊息以 i18n key + params 儲存，顯示時依使用者語系渲染（不存在地化字串，符合 ADR-004）。
// 純 in-app；無任何對外網路（SMTP 外送屬新執行期相依，待 ADR-012，未實作）。

import type { Db } from './db.js';

export interface NotifyInput {
  userId: number;
  kind: string;
  scanTaskId?: number | null;
  messageKey: string;
  params?: Record<string, unknown>;
}

export interface NotificationRow {
  id: number;
  kind: string;
  scan_task_id: number | null;
  message_key: string;
  params_json: string | null;
  read: number;
  created_at: string;
}

/** 建立一則使用者通知；回傳 id。 */
export function notify(db: Db, n: NotifyInput): number {
  return Number(
    db
      .prepare(
        'INSERT INTO notifications (user_id, kind, scan_task_id, message_key, params_json) VALUES (?, ?, ?, ?, ?)',
      )
      .run(n.userId, n.kind, n.scanTaskId ?? null, n.messageKey, n.params ? JSON.stringify(n.params) : null)
      .lastInsertRowid,
  );
}

/** 列出某使用者的通知（新到舊）。 */
export function listNotifications(db: Db, userId: number, limit = 50): NotificationRow[] {
  return db
    .prepare(
      'SELECT id, kind, scan_task_id, message_key, params_json, read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(userId, limit) as NotificationRow[];
}

export function unreadCount(db: Db, userId: number): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(userId) as {
      n: number;
    }
  ).n;
}

/** 標記單一通知為已讀（僅限本人）；回傳是否有變更。 */
export function markRead(db: Db, id: number, userId: number): boolean {
  return db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** 標記本人全部未讀為已讀；回傳更新筆數。 */
export function markAllRead(db: Db, userId: number): number {
  return db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId).changes;
}
