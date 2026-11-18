import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { api, public_api } from '../api/axios';
import { signOut } from '../api/auth';
import { useAuthStore } from '../store';

const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

const fail = (config: InternalAxiosRequestConfig, status: number) =>
  Promise.reject(
    new AxiosError('fail', String(status), config, null, {
      data: {},
      status,
      statusText: '',
      headers: {},
      config,
    }),
  );

const user = { user_id: 1, full_name: 'T', email: 't@example.com', role: 'customer' };

const networkError = (config: InternalAxiosRequestConfig) =>
  Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config));

describe('api client session handling', () => {
  const originalApiAdapter = api.defaults.adapter;
  const originalPublicAdapter = public_api.defaults.adapter;

  beforeEach(() => {
    useAuthStore.getState().login({ user, token: 'expired' });
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    public_api.defaults.adapter = originalPublicAdapter;
    useAuthStore.getState().logout();
  });

  it('refreshes once for concurrent 401s and retries with the new token', async () => {
    const refresh = vi.fn((config: InternalAxiosRequestConfig) =>
      ok(config, { token: 'fresh', user }),
    );
    public_api.defaults.adapter = refresh as unknown as AxiosAdapter;
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      const auth = AxiosHeaders.from(config.headers).get('Authorization');
      return auth === 'Bearer fresh' ? ok(config, { url: config.url }) : fail(config, 401);
    }) as AxiosAdapter;

    const [a, b, c] = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect([a.data.url, b.data.url, c.data.url]).toEqual(['/a', '/b', '/c']);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Cookie-based: the refresh call carries no token in its body.
    expect(refresh.mock.calls[0][0].url).toBe('/auth/refresh');
    expect(refresh.mock.calls[0][0].data).toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBe('fresh');
  });

  it('after a reload (no token in memory) gets one before the first request', async () => {
    useAuthStore.getState().setAccessToken(null as unknown as string);
    const refresh = vi.fn((config: InternalAxiosRequestConfig) =>
      ok(config, { token: 'fresh', user: { ...user, full_name: 'Server Name' } }),
    );
    public_api.defaults.adapter = refresh as unknown as AxiosAdapter;
    const seen: (string | undefined)[] = [];
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      seen.push(AxiosHeaders.from(config.headers).get('Authorization') as string | undefined);
      return ok(config, {});
    }) as AxiosAdapter;

    await Promise.all([api.get('/a'), api.get('/b')]);

    expect(seen).toEqual(['Bearer fresh', 'Bearer fresh']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.full_name).toBe('Server Name');
  });

  it('logs out (without looping) when the refresh token is rejected', async () => {
    const refresh = vi.fn((config: InternalAxiosRequestConfig) => fail(config, 401));
    public_api.defaults.adapter = refresh as unknown as AxiosAdapter;
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      fail(config, 401)) as AxiosAdapter;

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('stays signed in when the refresh fails for network reasons', async () => {
    public_api.defaults.adapter = networkError as unknown as AxiosAdapter;
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      fail(config, 401)) as AxiosAdapter;

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('never writes tokens to localStorage', () => {
    useAuthStore.getState().login({ user, token: 'secret-access-token' });
    const stored = localStorage.getItem('auth-storage') ?? '';
    expect(stored).toContain('"isAuthenticated":true');
    expect(stored).not.toContain('secret-access-token');
    expect(stored).not.toMatch(/token/i);
  });

  it('signOut ends the server session, and signs out locally even if that fails', async () => {
    const logoutCall = vi.fn((config: InternalAxiosRequestConfig) => ok(config, ''));
    public_api.defaults.adapter = logoutCall as unknown as AxiosAdapter;
    await signOut();
    expect(logoutCall.mock.calls[0][0].url).toBe('/auth/logout');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    useAuthStore.getState().login({ user, token: 't' });
    public_api.defaults.adapter = networkError as unknown as AxiosAdapter;
    await signOut();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects an HTML page returned in place of JSON (misconfigured VITE_API_URL)', async () => {
    public_api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      Promise.resolve({
        data: '<!doctype html><html></html>',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html; charset=utf-8' },
        config,
      })) as AxiosAdapter;

    await expect(public_api.get('/destinations')).rejects.toThrow(/VITE_API_URL/);
  });
});
