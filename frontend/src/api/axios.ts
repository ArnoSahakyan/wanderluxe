import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store';
import { BACK_URL, ROUTES } from '../shared';
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
 * frontend host instead of the API (typically VITE_API_URL not set at build
 * time, so "/api" resolved against the static site). Fail loudly instead of
 * handing an HTML string to components that expect objects.
 */
const rejectHtmlResponses = (response: AxiosResponse) => {
  const contentType = String(response.headers['content-type'] ?? '');
  if (contentType.includes('text/html')) {
    throw new AxiosError(
      `The API at "${response.config.baseURL ?? ''}" returned an HTML page instead of JSON. ` +
        'Check that VITE_API_URL points to the backend (e.g. https://<service>.onrender.com/api).',
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

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

// One refresh at a time: concurrent 401s wait for the same promise.
let refreshInFlight: Promise<string> | null = null;

const refreshAccessToken = (refreshToken: string): Promise<string> => {
  refreshInFlight ??= public_api
    // Uses public_api on purpose: a 401 here must not re-enter this interceptor.
    .post<{ token: string }>('/auth/refresh', { refreshToken })
    .then(({ data }) => {
      useAuthStore.getState().setAccessToken(data.token);
      return data.token;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
};

api.interceptors.response.use(rejectHtmlResponses, async (error: AxiosError) => {
  const request = error.config as RetriableConfig | undefined;
  const status = error.response?.status;
  const { refreshToken, logout } = useAuthStore.getState();

  if (status === 401 && request && !request._retry && refreshToken) {
    request._retry = true;
    try {
      const token = await refreshAccessToken(refreshToken);
      request.headers.set('Authorization', `Bearer ${token}`);
      return api(request);
    } catch {
      logout();
      return Promise.reject(error);
    }
  }

  if (status === 401 && !refreshToken && useAuthStore.getState().isAuthenticated) {
    logout();
  }

  // Leaving a page the user may not see; mutations just surface their error.
  if (status === 403 && (request?.method ?? 'get').toLowerCase() === 'get') {
    navigateHome();
  }

  return Promise.reject(error);
});
