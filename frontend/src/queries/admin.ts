export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  users: (page: number, limit: number) => [...adminKeys.all, 'users', { page, limit }] as const,
  usersAll: () => [...adminKeys.all, 'users'] as const,
  bookings: (page: number, limit: number) =>
    [...adminKeys.all, 'bookings', { page, limit }] as const,
  bookingsAll: () => [...adminKeys.all, 'bookings'] as const,
  contacts: (page: number, limit: number) =>
    [...adminKeys.all, 'contacts', { page, limit }] as const,
  contactsAll: () => [...adminKeys.all, 'contacts'] as const,
};

export const profileKeys = {
  stats: ['profile', 'stats'] as const,
};
