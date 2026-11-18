import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { signOut } from '../../api';
import { ROUTES } from '../../shared';
import { useAuthStore } from '../../store';

/** Shown on every page while a visitor uses one of the demo accounts. */
export const DemoBanner = () => {
  const user = useAuthStore((state) => state.user);
  if (!user?.demo) return null;

  const isAdmin = user.role === 'admin';
  return (
    <div
      role='status'
      className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent-light/10 px-4 py-2 text-center text-sm text-text-light dark:bg-accent-dark/15 dark:text-text-dark'
    >
      <InformationCircleIcon
        className='size-5 shrink-0 text-accent-light dark:text-accent-dark'
        aria-hidden='true'
      />
      <span>
        {isAdmin
          ? 'You are exploring the demo admin: read-only, and customer details are masked.'
          : 'You are exploring a demo account. Bookings, favourites and reviews made here are removed after 24 hours.'}
      </span>
      <Link
        to={ROUTES.AUTH + ROUTES.SIGNUP}
        onClick={() => void signOut()}
        className='font-semibold underline underline-offset-2 hover:no-underline'
      >
        Create your own account
      </Link>
    </div>
  );
};
