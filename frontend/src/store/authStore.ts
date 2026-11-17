import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState } from '../shared';
import { queryClient } from '../lib/queryClient';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      login: ({ user, token, refreshToken }) =>
        set({
          user,
          accessToken: token,
          refreshToken,
          isAuthenticated: true,
        }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        // Drop the previous user's bookings, favourites, etc. from memory.
        queryClient.clear();
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    },
  ),
);
