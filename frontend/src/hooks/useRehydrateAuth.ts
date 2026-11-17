import { useEffect } from 'react';
import { useAuthStore } from '../store';
import { fetchCurrentUser } from '../api';

/**
 * On app start, re-validates the persisted session against GET /auth/me so the
 * profile and role shown in the UI always come from the server (the persisted
 * copy is only a placeholder for the first paint). Runs once per page load.
 */
export const useRehydrateAuth = () => {
  useEffect(() => {
    let cancelled = false;
    const { accessToken, refreshToken } = useAuthStore.getState();
    if (!accessToken && !refreshToken) return;

    fetchCurrentUser()
      .then((user) => {
        if (cancelled) return;
        const state = useAuthStore.getState();
        state.login({ user, token: state.accessToken, refreshToken: state.refreshToken });
      })
      .catch(() => {
        // 401 after a failed refresh already logged the user out in the interceptor;
        // network errors keep the cached session so the app still works offline-ish.
      });

    return () => {
      cancelled = true;
    };
  }, []);
};
