export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  users: (page: number, limit: number) => [...adminKeys.all, 'users', { page, limit }] as const,
  usersAll: () => [...adminKeys.all, 'users'] as const,
  bookings: (page: number, limit: number, status?: string) =>
    [...adminKeys.all, 'bookings', { page, limit, status }] as const,
  bookingsAll: () => [...adminKeys.all, 'bookings'] as const,
  bookingHistory: (id: number) => [...adminKeys.all, 'bookings', 'history', id] as const,
  contacts: (page: number, limit: number) =>
    [...adminKeys.all, 'contacts', { page, limit }] as const,
  contactsAll: () => [...adminKeys.all, 'contacts'] as const,
};

export const profileKeys = {
  stats: ['profile', 'stats'] as const,
};
