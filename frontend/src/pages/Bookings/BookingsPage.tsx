import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookingCard, EmptyState, ErrorState, LoadingState, Pagination } from '../../components';
import { BookingView, IBooking, ROUTES } from '../../shared';
import { useBookings, usePagination } from '../../hooks';

const TABS: { view: BookingView; label: string; empty: string }[] = [
  {
    view: 'upcoming',
    label: 'Upcoming',
    empty: "You don't have any upcoming trips. Start your next adventure!",
  },
  { view: 'past', label: 'Past', empty: 'Trips you have taken will appear here.' },
  { view: 'cancelled', label: 'Cancelled', empty: "You haven't cancelled any bookings." },
];

const isView = (value: string | null): value is BookingView =>
  TABS.some((tab) => tab.view === value);

const BookingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get('view');
  const view: BookingView = isView(rawView) ? rawView : 'upcoming';
  const { page, goToNextPage, goToPrevPage } = usePagination();
  const { data, isLoading, isError, error } = useBookings({ page }, view);

  const bookings: IBooking[] = data?.bookings || [];
  const totalPages = data?.totalPages || 1;
  const activeTab = TABS.find((tab) => tab.view === view)!;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, view]);

  // Switching tabs starts again at page 1.
  const selectView = (next: BookingView) =>
    setSearchParams(next === 'upcoming' ? {} : { view: next });

  return (
    <section className='py-12 bg-background-light dark:bg-background-dark min-h-screen'>
      <div className='container mx-auto px-4 lg:px-8'>
        <div className='text-center mb-8'>
          <h2 className='text-3xl font-bold text-primary-light dark:text-text-dark mb-4'>
            Your Bookings
          </h2>
          <p className='text-secondary-light dark:text-secondary-dark max-w-2xl mx-auto'>
            All your upcoming and past adventures with WanderLuxe
          </p>
        </div>

        <div role='tablist' aria-label='Booking history' className='mb-8 flex justify-center gap-2'>
          {TABS.map((tab) => {
            const selected = tab.view === view;
            return (
              <button
                key={tab.view}
                type='button'
                role='tab'
                aria-selected={selected}
                onClick={() => selectView(tab.view)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-primary-light text-white dark:bg-primary-dark'
                    : 'bg-white text-secondary-light ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-secondary-dark dark:ring-gray-700 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div role='tabpanel' aria-label={`${activeTab.label} bookings`}>
          {isLoading ? (
            <LoadingState message='Loading bookings...' />
          ) : isError ? (
            <ErrorState description={error && (error as Error).message} />
          ) : bookings.length === 0 ? (
            <div className='text-center py-12'>
              <EmptyState
                title={`No ${activeTab.label.toLowerCase()} bookings`}
                description={activeTab.empty}
                action={
                  view === 'upcoming' && (
                    <Link
                      to={ROUTES.TOURS}
                      className='mt-4 inline-block rounded-md bg-primary-light dark:bg-primary-dark px-6 py-3 text-sm font-medium text-white hover:bg-primary-light/90 dark:hover:bg-primary-dark/90 transition-colors'
                    >
                      Browse Tours
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <>
              <div className='flex flex-col gap-8'>
                {bookings.map((booking) => (
                  <BookingCard key={booking.booking_id} booking={booking} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  goToPrevPage={goToPrevPage}
                  goToNextPage={goToNextPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default BookingsPage;
