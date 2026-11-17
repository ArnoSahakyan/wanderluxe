import { useMutation } from '@tanstack/react-query';
import { updatePersonalInfo, changePassword } from '../api';
import { useToast } from './useToast';
import { useAuthStore } from '../store';
import { formatAxiosError } from '../utils';

export const useAccount = () => {
  const { showSuccess, showError } = useToast();
  const { login } = useAuthStore();

  const personalInfoMutation = useMutation({
    mutationFn: updatePersonalInfo,
    onSuccess: (response) => {
      showSuccess('Personal information updated successfully');

      // The API returns a sanitised user (no password data) including the role.
      const current = useAuthStore.getState();
      const updated = response.data.user;
      login({
        user: {
          ...current.user!,
          full_name: updated.full_name,
          email: updated.email,
          phone_number: updated.phone_number ?? null,
          phone: updated.phone_number ?? null,
          role: updated.role ?? current.user?.role ?? 'customer',
        },
        token: current.accessToken,
        refreshToken: current.refreshToken,
      });
    },

    onError: (error: Error) => {
      const message = formatAxiosError(error);
      showError(message || 'Failed to update personal info');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      showSuccess('Password changed successfully');
    },
    onError: (error: Error) => {
      const message = formatAxiosError(error);
      showError(message || 'Failed to change password');
    },
  });

  return {
    updatePersonalInfo: personalInfoMutation.mutate,
    updatePersonalInfoStatus: personalInfoMutation.status,
    changePassword: passwordMutation.mutate,
    changePasswordStatus: passwordMutation.status,
  };
};
