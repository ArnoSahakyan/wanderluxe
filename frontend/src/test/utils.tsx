import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { api, public_api } from '../api/axios';
import { useAuthStore } from '../store';
import type { AuthState } from '../shared';

type User = NonNullable<AuthState['user']>;

export interface MockRequest {
  method: string;
  url: string;
  params: unknown;
  body: unknown;
}

export interface MockReply {
  status?: number;
  data?: unknown;
}

type Handler = (req: MockRequest) => MockReply | undefined;

const originalAdapters = {
  api: api.defaults.adapter,
  public: public_api.defaults.adapter,
};

/**
 * Answers every request made through `api` and `public_api` with `handler`
 * (an unhandled request gets a 404). Returns the list of requests seen.
 */
export const mockApi = (handler: Handler): MockRequest[] => {
  const calls: MockRequest[] = [];
  const adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const req: MockRequest = {
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      params: config.params,
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    };
    calls.push(req);
    const reply = handler(req) ?? { status: 404, data: { message: `Unmocked ${req.url}` } };
    const status = reply.status ?? 200;
    const response: AxiosResponse = {
      data: reply.data ?? {},
      status,
      statusText: '',
      headers: { 'content-type': 'application/json' },
      config,
      request: {},
    };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        String(status),
        config,
        {},
        response,
      );
    }
    return response;
  };
  api.defaults.adapter = adapter as AxiosAdapter;
  public_api.defaults.adapter = adapter as AxiosAdapter;
  return calls;
};

export const restoreApi = () => {
  api.defaults.adapter = originalAdapters.api;
  public_api.defaults.adapter = originalAdapters.public;
};

export const customer: User = {
  user_id: 7,
  full_name: 'Jane Traveller',
  email: 'jane@example.com',
  role: 'customer',
};

export const admin: User = { ...customer, user_id: 1, full_name: 'Ada Admin', role: 'admin' };

export const signInAs = (user: User) =>
  useAuthStore.getState().login({ user, token: 'test-access-token' });

interface RenderOptions {
  /** Path pattern the element is mounted at (defaults to the initial URL). */
  path?: string;
  /** Initial URL. */
  route?: string;
  /** Extra routes, e.g. redirect targets to assert on. */
  routes?: RouteObject[];
}

/** Renders `ui` inside a fresh QueryClient, a memory router and a toast container. */
export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', path = route, routes = [] }: RenderOptions = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path, element: ui }, ...routes], {
    initialEntries: [route],
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastContainer />
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
};

/** Renders a route tree (for testing guards and redirects). */
export const renderRoutes = (routes: RouteObject[], route: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router };
};
