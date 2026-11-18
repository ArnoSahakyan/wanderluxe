import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import type { RouteObject } from 'react-router-dom';
import { AdminRoute } from '../admin/components/AdminRoute/AdminRoute';
import { ProtectedRoute } from '../components/ProtectedRoute/ProtectedRoute';
import { UnprotectedRoute } from '../components/UnprotectedRoute/UnprotectedRoute';
import UsersPage from '../admin/pages/Users/UsersPage';
import AdminBookingsPage from '../admin/pages/Bookings/AdminBookingsPage';
import { useAuthStore } from '../store';
import {
  admin,
  customer,
  mockApi,
  renderRoutes,
  renderWithProviders,
  restoreApi,
  signInAs,
} from './utils';

afterEach(() => {
  cleanup();
  toast.dismiss();
  restoreApi();
  useAuthStore.getState().logout();
});

const page = (text: string) => <p>{text}</p>;

const guardedRoutes: RouteObject[] = [
  { path: '/', element: page('Home page') },
  { element: <AdminRoute />, children: [{ path: '/admin', element: page('Admin dashboard') }] },
  { element: <ProtectedRoute />, children: [{ path: '/profile', element: page('Profile page') }] },
  {
    path: '/auth',
    element: <UnprotectedRoute />,
    children: [{ path: 'sign-in', element: page('Sign in page') }],
  },
];

describe('route guards', () => {
  it.each([
    ['a visitor', null, '/admin', 'Sign in page'],
    ['a customer', customer, '/admin', 'Home page'],
    ['an admin', admin, '/admin', 'Admin dashboard'],
    ['a visitor', null, '/profile', 'Sign in page'],
    ['a customer', customer, '/profile', 'Profile page'],
    ['a customer', customer, '/auth/sign-in', 'Profile page'],
    ['a visitor', null, '/auth/sign-in', 'Sign in page'],
  ])('%s opening %s sees "%s"', async (_who, user, url, expected) => {
    if (user) signInAs(user);
    const { router } = renderRoutes(guardedRoutes, url);

    expect(await screen.findByText(expected)).toBeInTheDocument();
    if (expected === 'Sign in page') expect(router.state.location.pathname).toBe('/auth/sign-in');
  });
});

const adminUsers = [
  {
    user_id: 1,
    full_name: 'Ada Admin',
    email: 'ada@example.com',
    phone_number: null,
    role_id: 1,
    Role: { role_id: 1, name: 'admin' },
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    user_id: 7,
    full_name: 'Jane Traveller',
    email: 'jane@example.com',
    phone_number: '+1 555 0100',
    role_id: 2,
    Role: { role_id: 2, name: 'customer' },
    created_at: '2026-03-02T10:00:00Z',
  },
];

describe('admin Users page', () => {
  it('lists users with their role and contact details', async () => {
    signInAs(admin);
    const calls = mockApi((req) =>
      req.url.startsWith('/account?')
        ? { data: { users: adminUsers, total: 2, page: 1, totalPages: 1 } }
        : undefined,
    );
    renderWithProviders(<UsersPage />);

    const janeRow = (await screen.findByText('Jane Traveller')).closest('tr')!;
    expect(within(janeRow).getByText('jane@example.com')).toBeInTheDocument();
    expect(within(janeRow).getByText('+1 555 0100')).toBeInTheDocument();
    expect(within(janeRow).getByText('Mar 02, 2026')).toBeInTheDocument();
    expect(within(janeRow).getByText('User')).toBeInTheDocument();

    const adaRow = screen.getByText('Ada Admin').closest('tr')!;
    expect(within(adaRow).getByText('Admin')).toBeInTheDocument();
    expect(within(adaRow).getByText('-')).toBeInTheDocument();

    expect(calls[0].url).toBe('/account?page=1&limit=10');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('shows an empty table message when there are no users', async () => {
    signInAs(admin);
    mockApi(() => ({ data: { users: [], total: 0, page: 1, totalPages: 0 } }));
    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('No users found.')).toBeInTheDocument();
  });

  it('shows an error state when the list cannot be loaded', async () => {
    signInAs(admin);
    mockApi(() => ({ status: 500, data: { message: 'boom' } }));
    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('Failed to load users')).toBeInTheDocument();
  });

  it('deletes a user only after confirming', async () => {
    signInAs(admin);
    const calls = mockApi((req) => {
      if (req.method === 'GET') {
        return { data: { users: adminUsers, total: 2, page: 1, totalPages: 1 } };
      }
      if (req.method === 'DELETE' && req.url === '/account/7') return { status: 204 };
      return undefined;
    });
    renderWithProviders(<UsersPage />);

    const janeRow = (await screen.findByText('Jane Traveller')).closest('tr')!;
    await userEvent.click(within(janeRow).getByTitle('Delete User'));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(within(janeRow).getByTitle('Delete User'));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete User' }),
    );

    expect(await screen.findByText('User deleted successfully')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual(['/account/7']);
  });
});

describe('admin Bookings page', () => {
  const NEXT: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'no_show', 'cancelled'],
    completed: ['refunded'],
    cancelled: [],
  };
  const booking = (booking_id: number, status: string) => ({
    booking_id,
    booking_date: '2026-05-10T09:00:00Z',
    number_of_people: 2,
    total_price: '2500.00',
    status,
    next_statuses: NEXT[status],
    User: { user_id: 7, full_name: 'Jane Traveller', email: 'jane@example.com' },
    Tour: { tour_id: 12, name: `Tour ${booking_id}`, Destination: { name: 'Bali' } },
  });
  const listOf = (...bookings: unknown[]) => ({
    data: { bookings, total: bookings.length, page: 1, totalPages: 1 },
  });
  const history = {
    data: {
      history: [
        {
          id: 1,
          from_status: null,
          to_status: 'pending',
          note: null,
          changed_at: '2026-05-10T09:00:00Z',
          ChangedBy: { user_id: 7, full_name: 'Jane Traveller' },
        },
      ],
    },
  };

  it('offers only the allowed next statuses and records a note', async () => {
    signInAs(admin);
    const calls = mockApi((req) => {
      if (req.method === 'GET' && req.url === '/booking') {
        return listOf(booking(1, 'pending'), booking(2, 'confirmed'), booking(3, 'cancelled'));
      }
      if (req.method === 'GET' && req.url === '/booking/1/history') return history;
      if (req.method === 'PATCH' && req.url === '/booking/1/status') return { data: {} };
      return undefined;
    });
    renderWithProviders(<AdminBookingsPage />);

    const pending = (await screen.findByText('Tour 1')).closest('tr')!;
    const cancelled = screen.getByText('Tour 3').closest('tr')!;
    expect(within(pending).getByText('PENDING')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: /Manage/ })).toBeInTheDocument();
    // A final booking can only show its history.
    expect(within(cancelled).getByRole('button', { name: /History/ })).toBeInTheDocument();

    await userEvent.click(within(pending).getByRole('button', { name: /Manage/ }));
    const dialog = await screen.findByRole('dialog');
    const choices = within(dialog)
      .getAllByRole('radio')
      .map((radio) => (radio as HTMLInputElement).value);
    expect(choices).toEqual(['confirmed', 'cancelled']);
    expect(await within(dialog).findByText('Booked (Pending)')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'Paid by transfer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update status' }));

    expect(await screen.findByText('Booking #1 is now confirmed')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      url: '/booking/1/status',
      body: { status: 'confirmed', note: 'Paid by transfer' },
    });
  });

  it('a final booking shows its history and no status choices', async () => {
    signInAs(admin);
    mockApi((req) => {
      if (req.url === '/booking') return listOf(booking(3, 'cancelled'));
      if (req.url === '/booking/3/history') return history;
      return undefined;
    });
    renderWithProviders(<AdminBookingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /History/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/can no longer change/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument();
  });

  it('shows the server reason when a change is refused', async () => {
    signInAs(admin);
    mockApi((req) => {
      if (req.url === '/booking') return listOf(booking(2, 'confirmed'));
      if (req.url === '/booking/2/history') return { data: { history: [] } };
      if (req.method === 'PATCH') {
        return { status: 409, data: { message: 'This booking is already cancelled.' } };
      }
      return undefined;
    });
    renderWithProviders(<AdminBookingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /Manage/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Cancelled/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update status' }));

    expect(await screen.findByText('This booking is already cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('filters the list by status', async () => {
    signInAs(admin);
    const calls = mockApi((req) =>
      req.url === '/booking' ? listOf(booking(2, 'confirmed')) : undefined,
    );
    renderWithProviders(<AdminBookingsPage />);

    await screen.findByText('Tour 2');
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'cancelled');
    await waitFor(() =>
      expect(calls[calls.length - 1]).toMatchObject({
        method: 'GET',
        url: '/booking',
        params: { page: 1, status: 'cancelled' },
      }),
    );
  });

  it('shows who cancelled a booking and why', async () => {
    signInAs(admin);
    mockApi((req) =>
      req.method === 'GET'
        ? listOf({
            ...booking(3, 'cancelled'),
            cancelled_at: '2026-05-12T09:00:00Z',
            cancellation_reason: 'Plans changed',
            CancelledBy: { user_id: 7, full_name: 'Jane Traveller' },
          })
        : undefined,
    );
    renderWithProviders(<AdminBookingsPage />);

    const row = (await screen.findByText('Tour 3')).closest('tr')!;
    expect(within(row).getByText(/May 12 by Jane Traveller/)).toBeInTheDocument();
    expect(within(row).getByText(/Plans changed/)).toBeInTheDocument();
  });
});
