import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState } from '../shared';
import { queryClient } from '../lib/queryClient';

/**
 * Who is signed in, for the UI.
 *
 * The access token lives only in memory: a page reload drops it and the first
 * API call gets a new one from POST /auth/refresh, which authenticates with the
 * httpOnly session cookie that scripts cannot read. Only the profile and the
 * "signed in" flag are kept in localStorage, so the first paint already shows
 * the right navbar; neither grants any access on its own.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      login: ({ user, token }) => set({ user, accessToken: token, isAuthenticated: true }),
      setAccessToken: (token) => set({ accessToken: token }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false });
        // Drop the previous user's bookings, favourites, etc. from memory.
        queryClient.clear();
      },
    }),
    {
      name: 'auth-storage',
      // v0 also stored the access and refresh tokens. Those sessions have no
      // cookie, so start signed out (and the tokens are erased from storage).
      version: 1,
      migrate: () => ({ user: null, isAuthenticated: false }),
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated, user: state.user }),
    },
  ),
);
