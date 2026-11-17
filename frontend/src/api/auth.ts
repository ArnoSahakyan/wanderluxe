import { api, public_api } from './axios.ts';
import { ForgotPasswordFormData, SignInFormData, SignUpFormData } from '../shared';

interface ResetPasswordRequest {
  new_password: string;
  token: string;
}

export const signIn = async (credentials: SignInFormData) => {
  const response = await public_api.post('/auth/signin', credentials);
  return response.data;
};

export const signUp = async (payload: SignUpFormData) => {
  const response = await public_api.post('/auth/signup', payload);
  return response.data;
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
