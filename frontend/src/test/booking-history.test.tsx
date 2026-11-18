import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import BookingsPage from '../pages/Bookings/BookingsPage';
import BookingDetailsPage from '../pages/Bookings/BookingDetailsPage';
import { useAuthStore } from '../store';
import { customer, mockApi, renderWithProviders, restoreApi, signInAs } from './utils';

const DAY = 24 * 60 * 60 * 1000;

const booking = (overrides: Record<string, unknown> = {}) => ({
  booking_id: 5,
  booking_date: '2026-11-01T10:00:00Z',
  number_of_people: 2,
  total_price: '2500.00',
  status: 'confirmed',
  tour_id: 12,
  tour_name: 'Bali Retreat',
  start_date: new Date(Date.now() + 30 * DAY).toISOString(),
  end_date: new Date(Date.now() + 37 * DAY).toISOString(),
  destination_name: 'Bali',
  category_name: 'Relaxation',
  image: '/bali.jpg',
  ...overrides,
});

const list = (bookings: unknown[]) => ({
  data: { bookings, total: bookings.length, page: 1, totalPages: 1 },
});

afterEach(() => {
  cleanup();
  restoreApi();
  useAuthStore.getState().logout();
});

describe('My Bookings tabs', () => {
  it('asks the API for the chosen view and shows cancelled bookings with their date', async () => {
    signInAs(customer);
    const calls = mockApi((req) => {
      if (req.url !== '/booking/my') return undefined;
      const { view } = req.params as { view: string };
      return view === 'cancelled'
        ? list([booking({ status: 'cancelled', cancelled_at: '2026-11-15T12:00:00Z' })])
        : list([]);
    });
    renderWithProviders(<BookingsPage />, {
      route: '/profile/bookings',
      path: '/profile/bookings',
    });

    expect(await screen.findByText('No upcoming bookings')).toBeInTheDocument();
    expect(calls[0].params).toMatchObject({ view: 'upcoming', page: 1 });
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: 'Cancelled' }));
    expect(await screen.findByText('Bali Retreat')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cancelled' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(/^Cancelled on /)).toBeInTheDocument();
    expect(calls[calls.length - 1]?.params).toMatchObject({ view: 'cancelled' });

    await userEvent.click(screen.getByRole('tab', { name: 'Past' }));
    expect(await screen.findByText('No past bookings')).toBeInTheDocument();
  });
});

describe('booking details', () => {
  const renderDetails = (routes: RouteObject[] = []) =>
    renderWithProviders(<BookingDetailsPage />, {
      route: '/profile/bookings/5',
      path: '/profile/bookings/:bookingId',
      routes,
    });

  it('explains a cancelled booking and offers no cancel button', async () => {
    signInAs(customer);
    mockApi((req) =>
      req.url === '/booking/5'
        ? {
            data: booking({
              status: 'cancelled',
              cancelled_at: '2026-11-15T12:00:00Z',
              cancellation_reason: 'Guide unavailable',
              cancelled_by_customer: false,
            }),
          }
        : undefined,
    );
    renderDetails();

    expect(await screen.findByText(/WanderLuxe cancelled this booking/)).toBeInTheDocument();
    expect(screen.getByText('Reason: Guide unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Booking/ })).not.toBeInTheDocument();
  });

  it('cancels with an optional reason and opens the Cancelled tab', async () => {
    signInAs(customer);
    const calls = mockApi((req) => {
      if (req.method === 'GET' && req.url === '/booking/5') return { data: booking() };
      if (req.method === 'PATCH' && req.url === '/booking/5/cancel') return { data: {} };
      return undefined;
    });
    renderDetails([{ path: '/profile/bookings', element: <p>Bookings list</p> }]);

    await userEvent.click(await screen.findByRole('button', { name: /Cancel Booking/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Plans changed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));

    expect(await screen.findByText('Bookings list')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ reason: 'Plans changed' }),
    );
  });
});
