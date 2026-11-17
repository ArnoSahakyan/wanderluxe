import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * Shared React Query client. Exported so non-React code (logout) can clear
 * cached per-user data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 4xx (not found, forbidden, validation) never helps.
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
