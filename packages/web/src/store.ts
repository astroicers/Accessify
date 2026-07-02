// 前端狀態（zustand）— 認證 session（DOM 與資料層唯一橋樑，visual-web-stack 鐵則）

import { create } from 'zustand';
import {
  api,
  getToken,
  setToken,
  getRole,
  setRole,
  getMustChange,
  setMustChange,
  getUsername,
  setUsername,
} from './lib/api.js';

interface AuthState {
  token: string | null;
  role: string | null;
  username: string | null;
  mustChange: boolean;
  setAuth: (token: string, role: string, mustChange: boolean, username: string) => void;
  clearMustChange: () => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: getToken(),
  role: getRole(),
  username: getUsername(),
  // 持久化（T801）：重整後強制改密 gate 仍生效
  mustChange: getMustChange(),
  setAuth: (token, role, mustChange, username) => {
    setToken(token);
    setRole(role);
    setMustChange(mustChange);
    setUsername(username);
    set({ token, role, mustChange, username });
  },
  clearMustChange: () => {
    setMustChange(false);
    set({ mustChange: false });
  },
  clear: () => {
    setToken(null);
    setRole(null);
    setMustChange(false);
    setUsername(null);
    set({ token: null, role: null, mustChange: false, username: null });
  },
}));

// 站內通知未讀計數（導覽指示與通知頁共享；T603）。
interface NotifyState {
  unread: number;
  refresh: () => Promise<void>;
}
export const useNotify = create<NotifyState>((set) => ({
  unread: 0,
  refresh: async () => {
    try {
      const { count } = await api.unreadCount();
      set({ unread: count });
    } catch {
      // 未登入或暫時失敗時不更新（不干擾畫面）
    }
  },
}));
