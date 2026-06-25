import { describe, it, expect } from 'vitest';
import { openDb, runMigrations, type Db } from './index.js';
import { notify, listNotifications, unreadCount, markRead, markAllRead } from './notifications.js';

function seed(): Db {
  const db = openDb(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('a', 'x', 'admin')").run(); // id 1
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('b', 'x', 'viewer')").run(); // id 2
  return db;
}

describe('notifications（T603 / 站內通知）', () => {
  it('建立/列出（新到舊、含 params）/未讀計數/標記已讀（限本人，不影響他人）', () => {
    const db = seed();
    notify(db, { userId: 1, kind: 'scan_completed', messageKey: 'notifications.msgScanCompleted', params: { target: 'x' } });
    const id2 = notify(db, { userId: 1, kind: 'new_issues', messageKey: 'notifications.msgNewIssues', params: { target: 'x', count: 3 } });
    notify(db, { userId: 2, kind: 'scan_completed', messageKey: 'notifications.msgScanCompleted', params: { target: 'y' } });

    expect(unreadCount(db, 1)).toBe(2);
    expect(unreadCount(db, 2)).toBe(1);

    const list = listNotifications(db, 1);
    expect(list.length).toBe(2);
    const first = list[0]!;
    expect(first.id).toBe(id2); // 新到舊
    expect(JSON.parse(first.params_json!).count).toBe(3);

    // 限本人：user2 不能標記 user1 的通知
    expect(markRead(db, id2, 2)).toBe(false);
    expect(unreadCount(db, 1)).toBe(2);
    expect(markRead(db, id2, 1)).toBe(true);
    expect(unreadCount(db, 1)).toBe(1);

    expect(markAllRead(db, 1)).toBe(1);
    expect(unreadCount(db, 1)).toBe(0);
    expect(unreadCount(db, 2)).toBe(1); // 他人不受影響
  });
});
