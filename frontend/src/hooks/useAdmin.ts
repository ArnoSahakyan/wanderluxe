import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminBookingStatus,
  AdminBookingsResponse,
  AdminStats,
  ContactMessagesResponse,
  ContactStatus,
  UpdateUserAdminPayload,
  UserStats,
  UsersResponse,
  cancelBooking,
  confirmBooking,
  deleteAdminUser,
  deleteContactMessage,
  fetchAllBookings,
  fetchContactMessages,
  getAdminStats,
  getAdminUsers,
  getUserStats,
  updateContactMessageStatus,
  updateUserAdmin,
} from '../api';
import { adminKeys, bookingKeys, profileKeys } from '../queries';

const ADMIN_PAGE_SIZE = 10;

// ── Dashboards ────────────────────────────────────────────────────────────────
export const useAdminStats = () =>
  useQuery<AdminStats>({
    queryKey: adminKeys.stats(),
    queryFn: getAdminStats,
  });

export const useProfileStats = () =>
  useQuery<UserStats>({
    queryKey: profileKeys.stats,
    queryFn: getUserStats,
  });

// ── Users ─────────────────────────────────────────────────────────────────────
export const useAdminUsers = (page: number, limit = ADMIN_PAGE_SIZE) =>
  useQuery<UsersResponse>({
    queryKey: adminKeys.users(page, limit),
    queryFn: () => getAdminUsers(page, limit),
    placeholderData: (prev) => prev,
  });

export const useUpdateAdminUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: UpdateUserAdminPayload }) =>
      updateUserAdmin(userId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.usersAll() }),
  });
};

export const useDeleteAdminUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.usersAll() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
  });
};

// ── Bookings ──────────────────────────────────────────────────────────────────
export const useAdminBookings = (
  page: number,
  status?: AdminBookingStatus,
  limit = ADMIN_PAGE_SIZE,
) =>
  useQuery<AdminBookingsResponse>({
    queryKey: adminKeys.bookings(page, limit, status),
    queryFn: () => fetchAllBookings(page, limit, status),
    placeholderData: (prev) => prev,
  });

const useInvalidateBookings = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.bookingsAll() });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    queryClient.invalidateQueries({ queryKey: bookingKeys.all });
  };
};

export const useAdminCancelBooking = () => {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: cancelBooking, onSuccess: invalidate });
};

export const useAdminConfirmBooking = () => {
  const invalidate = useInvalidateBookings();
  return useMutation({ mutationFn: confirmBooking, onSuccess: invalidate });
};

// ── Contact messages ──────────────────────────────────────────────────────────
export const useContactMessages = (page: number, limit = ADMIN_PAGE_SIZE) =>
  useQuery<ContactMessagesResponse>({
    queryKey: adminKeys.contacts(page, limit),
    queryFn: () => fetchContactMessages(page, limit),
    placeholderData: (prev) => prev,
  });

const useInvalidateContacts = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.contactsAll() });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
  };
};

export const useUpdateContactStatus = () => {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ContactStatus }) =>
      updateContactMessageStatus(id, status),
    onSuccess: invalidate,
  });
};

export const useDeleteContactMessage = () => {
  const invalidate = useInvalidateContacts();
  return useMutation({ mutationFn: deleteContactMessage, onSuccess: invalidate });
};
