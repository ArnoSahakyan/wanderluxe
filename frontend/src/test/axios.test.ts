import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { api, public_api } from '../api/axios';
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

describe('api client token refresh', () => {
  const originalApiAdapter = api.defaults.adapter;
  const originalPublicAdapter = public_api.defaults.adapter;

  beforeEach(() => {
    useAuthStore.getState().login({ user, token: 'expired', refreshToken: 'refresh-1' });
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    public_api.defaults.adapter = originalPublicAdapter;
    useAuthStore.getState().logout();
  });

  it('refreshes once for concurrent 401s and retries with the new token', async () => {
    const refresh = vi.fn((config: InternalAxiosRequestConfig) => ok(config, { token: 'fresh' }));
    public_api.defaults.adapter = refresh as unknown as AxiosAdapter;
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      const auth = AxiosHeaders.from(config.headers).get('Authorization');
      return auth === 'Bearer fresh' ? ok(config, { url: config.url }) : fail(config, 401);
    }) as AxiosAdapter;

    const [a, b, c] = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect([a.data.url, b.data.url, c.data.url]).toEqual(['/a', '/b', '/c']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('fresh');
  });

  it('logs out (without looping) when the refresh token is rejected', async () => {
    const refresh = vi.fn((config: InternalAxiosRequestConfig) => fail(config, 401));
    public_api.defaults.adapter = refresh as unknown as AxiosAdapter;
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      fail(config, 401)) as AxiosAdapter;

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
