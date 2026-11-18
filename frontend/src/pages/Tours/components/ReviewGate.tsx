import { FC, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useReviewEligibility } from '../../../hooks';
import { ROUTES } from '../../../shared';
import { useAuthStore } from '../../../store';
import { ReviewForm } from './ReviewForm.tsx';

const Note: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className='bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8'>
    <h2 className='text-xl font-bold text-primary-light dark:text-primary-dark mb-2'>{title}</h2>
    <p className='text-secondary-light dark:text-secondary-dark'>{children}</p>
  </div>
);

/** Shows the review form only to customers who have travelled on the tour. */
export const ReviewGate: FC<{ tourId: number }> = ({ tourId }) => {
  const { isAuthenticated, user } = useAuthStore();
  const { data, isLoading } = useReviewEligibility(tourId);

  if (!isAuthenticated) {
    return (
      <Note title='Travelled with us?'>
        Reviews open after your trip.{' '}
        <Link
          to={ROUTES.AUTH + ROUTES.SIGNIN}
          className='font-medium text-primary-light dark:text-primary-dark hover:underline'
        >
          Sign in
        </Link>{' '}
        to share yours.
      </Note>
    );
  }
  // Admins moderate reviews; they don't write them.
  if (user?.role === 'admin' || isLoading || !data) return null;
  if (data.canReview) return <ReviewForm tourId={tourId} />;
  if (data.reason === 'already_reviewed') {
    return (
      <Note title='Thanks for your review'>
        You&apos;ve already reviewed this tour. You can manage it under{' '}
        <Link
          to={ROUTES.PROFILE_REVIEWS}
          className='font-medium text-primary-light dark:text-primary-dark hover:underline'
        >
          My Reviews
        </Link>
        .
      </Note>
    );
  }
  return (
    <Note title='Reviews open after your trip'>
      Once you have travelled on this tour, you can tell other travellers how it was.
    </Note>
  );
};
