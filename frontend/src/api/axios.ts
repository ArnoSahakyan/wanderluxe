import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store';
import { AuthState, BACK_URL, ROUTES } from '../shared';
import { globalNavigate } from './navigationRegistry';

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const navigateHome = () => {
  if (globalNavigate) {
    globalNavigate(ROUTES.HOME);
  } else if (typeof window !== 'undefined') {
    window.location.href = ROUTES.HOME;
  }
};

/**
 * The API always answers with JSON. An HTML page means the request hit the
 * frontend host instead of the API (typically the /api forwarding is missing:
 * the Vite dev proxy locally, the rewrite in vercel.json on Vercel). Fail
 * loudly instead of handing an HTML string to components that expect objects.
 */
const rejectHtmlResponses = (response: AxiosResponse) => {
  const contentType = String(response.headers['content-type'] ?? '');
  if (contentType.includes('text/html')) {
    throw new AxiosError(
      `The API at "${response.config.baseURL ?? ''}" returned an HTML page instead of JSON. ` +
        'Check that /api is forwarded to the backend (vercel.json rewrite, Vite proxy) and VITE_API_URL is /api.',
      AxiosError.ERR_BAD_RESPONSE,
      response.config,
      response.request,
      response,
    );
  }
  return response;
};

/** Client for endpoints that never need the user's token. */
export const public_api = axios.create({
  baseURL: BACK_URL,
  headers: { 'Content-Type': 'application/json' },
});
public_api.interceptors.response.use(rejectHtmlResponses);

/** Client that attaches the access token and transparently refreshes it once on 401. */
export const api = axios.create({
  baseURL: BACK_URL,
  headers: { 'Content-Type': 'application/json' },
});

type SessionResponse = { token: string; user: NonNullable<AuthState['user']> };

// One refresh at a time: concurrent callers wait for the same promise.
let refreshInFlight: Promise<string> | null = null;

/**
 * Gets a new access token (and the current profile) using the httpOnly session
 * cookie, which the browser sends to /api/auth only. Signs out locally when the
 * session is gone.
 */
export const refreshSession = (): Promise<string> => {
  refreshInFlight ??= public_api
    // Uses public_api on purpose: a 401 here must not re-enter this interceptor.
    .post<SessionResponse>('/auth/refresh')
    .then(({ data }) => {
      useAuthStore.getState().login({ user: data.user, token: data.token });
      return data.token;
    })
    .catch((error: unknown) => {
      // Only a rejected session signs the user out; a network blip keeps the UI state.
      if (error instanceof AxiosError && error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { accessToken, isAuthenticated } = useAuthStore.getState();
  // After a reload the token is gone from memory: get one before the first call,
  // so optional-auth endpoints (favourites on tour pages…) see the user too.
  const token = accessToken ?? (isAuthenticated ? await refreshSession().catch(() => null) : null);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(rejectHtmlResponses, async (error: AxiosError) => {
  const request = error.config as RetriableConfig | undefined;
  const status = error.response?.status;

  if (status === 401 && request && !request._retry && useAuthStore.getState().isAuthenticated) {
    request._retry = true;
    try {
      const token = await refreshSession();
      request.headers.set('Authorization', `Bearer ${token}`);
      return api(request);
    } catch {
      return Promise.reject(error);
    }
  }

  // Leaving a page the user may not see; mutations just surface their error.
  if (status === 403 && (request?.method ?? 'get').toLowerCase() === 'get') {
    navigateHome();
  }

  return Promise.reject(error);
});
