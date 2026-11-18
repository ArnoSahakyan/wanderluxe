import { useEffect } from 'react';
import { useAuthStore } from '../store';
import { refreshSession } from '../api';

/**
 * On app start (and when the admin area mounts) exchanges the session cookie for
 * a fresh access token and the server's copy of the profile, so the name and
 * role shown in the UI always come from the server. The persisted profile is
 * only a placeholder for the first paint. A rejected session signs out.
 */
export const useRehydrateAuth = () => {
  useEffect(() => {
    if (!useAuthStore.getState().isAuthenticated) return;
    // Network errors keep the cached profile so the app still renders.
    refreshSession().catch(() => {});
  }, []);
};
