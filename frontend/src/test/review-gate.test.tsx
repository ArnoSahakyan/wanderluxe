import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewGate } from '../pages/Tours/components';
import { BookingCard } from '../components';
import { useAuthStore } from '../store';
import { admin, customer, mockApi, renderWithProviders, restoreApi, signInAs } from './utils';

afterEach(() => {
  cleanup();
  restoreApi();
  useAuthStore.getState().logout();
});

const eligibility = (canReview: boolean, reason: string) =>
  mockApi((req) =>
    req.url === '/review/eligibility/12' ? { data: { canReview, reason } } : undefined,
  );

describe('review form on the tour page', () => {
  it('asks a signed-out visitor to sign in instead of showing the form', async () => {
    const calls = mockApi(() => undefined);
    renderWithProviders(<ReviewGate tourId={12} />);
    expect(screen.getByText('Travelled with us?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/sign-in');
    expect(screen.queryByRole('heading', { name: 'Leave a Review' })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows the form to a customer who has travelled on the tour', async () => {
    signInAs(customer);
    eligibility(true, 'eligible');
    renderWithProviders(<ReviewGate tourId={12} />);
    expect(await screen.findByRole('heading', { name: 'Leave a Review' })).toBeInTheDocument();
  });

  it('explains why a customer cannot review yet', async () => {
    signInAs(customer);
    eligibility(false, 'not_travelled');
    renderWithProviders(<ReviewGate tourId={12} />);
    expect(await screen.findByText('Reviews open after your trip')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Leave a Review' })).not.toBeInTheDocument();
  });

  it('points to My Reviews after the customer has reviewed', async () => {
    signInAs(customer);
    eligibility(false, 'already_reviewed');
    renderWithProviders(<ReviewGate tourId={12} />);
    expect(await screen.findByText('Thanks for your review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My Reviews' })).toHaveAttribute(
      'href',
      '/profile/reviews',
    );
  });

  it('shows nothing to admins', () => {
    signInAs(admin);
    eligibility(false, 'not_travelled');
    renderWithProviders(<ReviewGate tourId={12} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('booking card', () => {
  const booking = {
    booking_id: 5,
    booking_date: '2026-10-01T10:00:00Z',
    number_of_people: 2,
    total_price: '2500.00',
    tour_id: 12,
    tour_name: 'Bali Retreat',
    start_date: '2026-10-10',
    end_date: '2026-10-17',
    destination_name: 'Bali',
    category_name: 'Relaxation',
    image: '/bali.jpg',
  };

  it('offers a review link only for completed trips', () => {
    renderWithProviders(<BookingCard booking={{ ...booking, status: 'completed' }} />);
    expect(screen.getByRole('link', { name: 'Write a review' })).toHaveAttribute(
      'href',
      '/tours/12',
    );
    cleanup();
    renderWithProviders(<BookingCard booking={{ ...booking, status: 'confirmed' }} />);
    expect(screen.queryByRole('link', { name: 'Write a review' })).not.toBeInTheDocument();
  });
});
