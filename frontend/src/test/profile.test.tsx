import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProfileHomePage from '../pages/Profile/ProfileHomePage';
import MyReviewsPage from '../pages/Profile/MyReviewsPage';
import { useAuthStore } from '../store';
import { customer, mockApi, renderWithProviders, restoreApi, signInAs } from './utils';

// Shapes exactly as the API sends them: Sequelize timestamps are camelCase.
const booking = {
  booking_id: 3,
  user_id: 7,
  tour_id: 2,
  booking_date: '2026-11-18T08:53:29.866Z',
  number_of_people: 1,
  total_price: '1999.99',
  status: 'pending',
  createdAt: '2026-11-18T08:53:29.866Z',
  updatedAt: '2026-11-18T08:53:29.866Z',
  Tour: { name: 'Coastal Highlights of Australia', tour_id: 2 },
};
const review = {
  review_id: 1,
  user_id: 7,
  tour_id: 2,
  rating: 5,
  comment: 'Wonderful coastal views and a great guide.',
  createdAt: '2026-11-18T08:54:24.933Z',
  updatedAt: '2026-11-18T08:54:24.933Z',
  tour_name: 'Coastal Highlights of Australia',
};

afterEach(() => {
  cleanup();
  restoreApi();
  useAuthStore.getState().logout();
});

describe('dates on the profile pages', () => {
  it('the dashboard shows when each recent booking was made', async () => {
    signInAs(customer);
    mockApi((req) =>
      req.url === '/account/stats'
        ? {
            data: {
              stats: { totalBookings: 1, totalReviews: 0, totalFavorites: 0, rank: 'Explorer' },
              recentBookings: [booking],
            },
          }
        : undefined,
    );
    renderWithProviders(<ProfileHomePage />);

    expect(await screen.findByText('Coastal Highlights of Australia')).toBeInTheDocument();
    expect(screen.getByText(/^Booked on /)).not.toHaveTextContent('Invalid Date');
    expect(screen.getByText(/^Booked on /)).toHaveTextContent(
      new Date(booking.booking_date).toLocaleDateString(),
    );
  });

  it('My Reviews renders the review date instead of crashing', async () => {
    signInAs(customer);
    mockApi((req) =>
      req.url.startsWith('/review/my')
        ? { data: { reviews: [review], total: 1, currentPage: 1, totalPages: 1 } }
        : undefined,
    );
    renderWithProviders(<MyReviewsPage />);

    expect(await screen.findByText('Reviewed on November 18, 2026')).toBeInTheDocument();
  });
});
