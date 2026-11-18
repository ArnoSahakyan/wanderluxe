import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import TourDetailsPage from '../pages/Tours/TourDetailsPage';
import { useAuthStore } from '../store';
import { customer, mockApi, renderWithProviders, restoreApi, signInAs } from './utils';
import type { MockRequest } from './utils';

const DAY = 24 * 60 * 60 * 1000;

const makeTour = (overrides: Record<string, unknown> = {}) => ({
  tour_id: '12',
  name: 'Bali Retreat',
  description: 'Temples, rice terraces and beaches.',
  price: 1250,
  start_date: new Date(Date.now() + 30 * DAY).toISOString(),
  end_date: new Date(Date.now() + 37 * DAY).toISOString(),
  available_spots: 4,
  category_id: 1,
  category_name: 'Relaxation',
  destination_id: 2,
  destination_name: 'Bali',
  hasReviewed: true,
  images: [],
  ...overrides,
});

const tourApi =
  (tour: ReturnType<typeof makeTour>, extra?: (req: MockRequest) => unknown) =>
  (req: MockRequest) => {
    if (req.method === 'GET' && req.url === '/tours/12') return { data: tour };
    if (req.url.startsWith('/review/tour/12')) return { data: { reviews: [], total: 0 } };
    if (req.url === '/favorite/check/12') return { data: { inFavorites: false } };
    const reply = extra?.(req);
    return reply ? (reply as { status?: number; data?: unknown }) : undefined;
  };

const renderTour = () =>
  renderWithProviders(<TourDetailsPage />, {
    route: '/tours/12',
    path: '/tours/:tourId',
    routes: [{ path: '/auth/sign-in', element: <p>Sign in page</p> }],
  });

const guests = () => screen.getByLabelText('Guests:');
const setGuests = (value: string) => fireEvent.change(guests(), { target: { value } });

afterEach(() => {
  cleanup();
  toast.dismiss();
  restoreApi();
  useAuthStore.getState().logout();
});

describe('Tour booking', () => {
  it('updates the total as the guest count changes', async () => {
    mockApi(tourApi(makeTour()));
    renderTour();

    expect(await screen.findByRole('heading', { name: 'Bali Retreat' })).toBeInTheDocument();
    expect(screen.getByText('Total for 1 guest')).toBeInTheDocument();
    expect(screen.getByText('$1,250.00')).toBeInTheDocument();
    expect(guests()).toHaveAttribute('max', '4');

    setGuests('3');
    expect(screen.getByText('Total for 3 guests')).toBeInTheDocument();
    expect(screen.getByText('$3,750.00')).toBeInTheDocument();

    // Zero, negatives and junk fall back to one guest.
    setGuests('0');
    expect(guests()).toHaveValue(1);
  });

  it('refuses more guests than there are spots, without calling the API', async () => {
    signInAs(customer);
    const calls = mockApi(tourApi(makeTour()));
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    setGuests('6');
    // The limit shows next to the field and Book is disabled until it fits.
    expect(screen.getByRole('alert')).toHaveTextContent('Only 4 spots left');
    expect(guests()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Book Now' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Book Now' }));
    expect(calls.some((c) => c.method === 'POST' && c.url === '/booking')).toBe(false);

    setGuests('4');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book Now' })).toBeEnabled();
  });

  it('books the tour for the chosen number of guests', async () => {
    signInAs(customer);
    const calls = mockApi(
      tourApi(makeTour(), (req) =>
        req.method === 'POST' && req.url === '/booking' ? { status: 201, data: {} } : undefined,
      ),
    );
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    setGuests('2');
    await userEvent.click(screen.getByRole('button', { name: 'Book Now' }));

    expect(await screen.findByText('Booking successful!')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: '/booking',
      body: { tour_id: 12, number_of_people: 2 },
    });
  });

  it('shows the API error when the booking is rejected', async () => {
    signInAs(customer);
    mockApi(
      tourApi(makeTour(), (req) =>
        req.method === 'POST' ? { status: 400, data: { message: 'Not enough spots' } } : undefined,
      ),
    );
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    await userEvent.click(screen.getByRole('button', { name: 'Book Now' }));

    expect(await screen.findByText('Not enough spots')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Book Now' })).toBeEnabled());
  });

  it('sends a signed-out visitor to sign in', async () => {
    const calls = mockApi(tourApi(makeTour()));
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    await userEvent.click(screen.getByRole('button', { name: 'Book Now' }));

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('marks a departed tour as unavailable', async () => {
    mockApi(tourApi(makeTour({ start_date: new Date(Date.now() - DAY).toISOString() })));
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    expect(screen.getByRole('status')).toHaveTextContent('already departed');
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(guests()).toBeDisabled();
  });

  it('marks a sold-out tour as fully booked', async () => {
    mockApi(tourApi(makeTour({ available_spots: 0 })));
    renderTour();
    await screen.findByRole('heading', { name: 'Bali Retreat' });

    expect(screen.getByRole('status')).toHaveTextContent('This tour is fully booked.');
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('shows a not-found state when the tour cannot be loaded', async () => {
    mockApi(() => ({ status: 404, data: { message: 'Tour not found' } }));
    renderTour();

    expect(await screen.findByRole('heading', { name: 'Tour not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse All Tours' })).toHaveAttribute(
      'href',
      '/tours',
    );
  });
});
