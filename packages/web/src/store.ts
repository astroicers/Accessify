// 前端狀態（zustand）— 認證 session（DOM 與資料層唯一橋樑，visual-web-stack 鐵則）

import { create } from 'zustand';
import { getToken, setToken, getRole, setRole } from './lib/api.js';

interface AuthState {
  token: string | null;
  role: string | null;
  mustChange: boolean;
  setAuth: (token: string, role: string, mustChange: boolean) => void;
  clearMustChange: () => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: getToken(),
  role: getRole(),
  mustChange: false,
  setAuth: (token, role, mustChange) => {
    setToken(token);
    setRole(role);
    set({ token, role, mustChange });
  },
  clearMustChange: () => set({ mustChange: false }),
  clear: () => {
    setToken(null);
    setRole(null);
    set({ token: null, role: null, mustChange: false });
  },
}));
