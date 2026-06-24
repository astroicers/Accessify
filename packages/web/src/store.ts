// 前端狀態（zustand）— 認證 session（DOM 與資料層唯一橋樑，visual-web-stack 鐵則）

import { create } from 'zustand';
import { getToken, setToken } from './lib/api.js';

interface AuthState {
  token: string | null;
  role: string | null;
  setAuth: (token: string, role: string) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: getToken(),
  role: null,
  setAuth: (token, role) => {
    setToken(token);
    set({ token, role });
  },
  clear: () => {
    setToken(null);
    set({ token: null, role: null });
  },
}));
