import { api, public_api } from './axios.ts';
import { useAuthStore } from '../store';
import { ForgotPasswordFormData, SignInFormData, SignUpFormData } from '../shared';

interface ResetPasswordRequest {
  new_password: string;
  token: string;
}

export const signIn = async (credentials: SignInFormData) => {
  const response = await public_api.post('/auth/signin', credentials);
  return response.data;
};

export const getDemoStatus = async (): Promise<{ enabled: boolean }> => {
  const response = await public_api.get('/auth/demo');
  return response.data;
};

/** Signs in as the shared demo customer or demo admin (no password; sets the session cookie). */
export const demoSignIn = async (role: 'customer' | 'admin') => {
  const response = await public_api.post('/auth/demo', { role });
  return response.data;
};

export const signUp = async (payload: SignUpFormData) => {
  const response = await public_api.post('/auth/signup', payload);
  return response.data;
};

/**
 * Ends the session on the server (revokes it and clears the httpOnly cookie),
 * then locally. The local sign-out happens even if the server cannot be reached.
 */
export const signOut = async () => {
  try {
    await public_api.post('/auth/logout');
  } catch {
    // Offline or API asleep: the cookie expires on its own; still sign out here.
  } finally {
    useAuthStore.getState().logout();
  }
};

export const fetchCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data.user;
};

export const requestPasswordReset = async (data: ForgotPasswordFormData) => {
  const response = await public_api.post('/auth/request-password-reset', data);
  return response.data;
};

export const resetPassword = async ({ new_password, token }: ResetPasswordRequest) => {
  const response = await public_api.post(
    '/auth/reset-password',
    { new_password },
    { params: { token } },
  );
  return response.data;
};
