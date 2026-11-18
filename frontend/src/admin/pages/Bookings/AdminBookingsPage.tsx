import { useState } from 'react';
import { format } from 'date-fns';
import {
  AdjustmentsHorizontalIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { ErrorState, Loader, Pagination } from '../../../components';
import { useAdminBookings } from '../../../hooks';
import type { AdminBooking, AdminBookingStatus } from '../../../api';
import { BookingStatusDialog } from './BookingStatusDialog';
import { STATUS_BADGE, STATUS_LABELS } from './bookingStatus';

const STATUS_FILTERS: { value: AdminBookingStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  ...(Object.keys(STATUS_LABELS) as AdminBookingStatus[]).map((value) => ({
    value,
    label: STATUS_LABELS[value],
  })),
];

const AdminBookingsPage = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AdminBookingStatus | ''>('');
  const [managed, setManaged] = useState<AdminBooking | null>(null);

  const { data, isLoading, isError } = useAdminBookings(page, status || undefined);

  const bookings = data?.bookings ?? [];
  const totalPages = data?.totalPages ?? 1;

  if (isLoading) return <Loader />;
  if (isError && !data) {
    return <ErrorState title='Failed to load bookings' description='Please try again later.' />;
  }

  return (
    <div className='py-8'>
      <div className='sm:flex sm:items-center'>
        <div className='sm:flex-auto'>
          <h1 className='text-3xl font-semibold leading-6 text-primary-light dark:text-text-dark'>
            Bookings
          </h1>
          <p className='mt-2 text-sm text-secondary-light dark:text-secondary-dark'>
            View and manage all customer bookings, track revenue, and monitor tour occupancy.
          </p>
        </div>
        <div className='mt-4 sm:mt-0 sm:ml-16 sm:flex-none'>
          <label htmlFor='booking-status-filter' className='sr-only'>
            Filter by status
          </label>
          <select
            id='booking-status-filter'
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdminBookingStatus | '');
              setPage(1);
            }}
            className='form-input'
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className='mt-8 flex flex-col'>
        <div className='-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8'>
          <div className='inline-block min-w-full py-2 align-middle md:px-6 lg:px-8'>
            <div className='overflow-hidden shadow-sm ring-1 ring-black/5 md:rounded-lg'>
              <table className='min-w-full divide-y divide-gray-300 dark:divide-gray-700'>
                <thead className='bg-gray-50 dark:bg-gray-800'>
                  <tr>
                    <th
                      scope='col'
                      className='py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-primary-light dark:text-text-dark sm:pl-6'
                    >
                      Booking ID
                    </th>
                    <th
                      scope='col'
                      className='px-3 py-3.5 text-left text-sm font-semibold text-primary-light dark:text-text-dark'
                    >
                      Client
                    </th>
                    <th
                      scope='col'
                      className='px-3 py-3.5 text-left text-sm font-semibold text-primary-light dark:text-text-dark'
                    >
                      Tour Details
                    </th>
                    <th
                      scope='col'
                      className='px-3 py-3.5 text-left text-sm font-semibold text-primary-light dark:text-text-dark'
                    >
                      Pricing
                    </th>
                    <th
                      scope='col'
                      className='px-3 py-3.5 text-left text-sm font-semibold text-primary-light dark:text-text-dark'
                    >
                      Status
                    </th>
                    <th scope='col' className='relative py-3.5 pl-3 pr-4 sm:pr-6'>
                      <span className='sr-only'>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-200 dark:divide-gray-700 bg-background-light dark:bg-background-dark'>
                  {bookings.map((booking) => (
                    <tr
                      key={booking.booking_id}
                      className={booking.status === 'cancelled' ? 'opacity-70' : undefined}
                    >
                      <td className='whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6 text-secondary-light dark:text-secondary-dark'>
                        <div className='font-mono'>#{booking.booking_id}</div>
                        <div className='text-xs text-gray-500 mt-1'>
                          {format(new Date(booking.booking_date), 'MMM dd, yyyy')}
                        </div>
                      </td>
                      <td className='whitespace-nowrap px-3 py-4 text-sm text-primary-light dark:text-text-dark'>
                        <div className='font-semibold'>{booking.User?.full_name}</div>
                        <div className='text-secondary-light dark:text-secondary-dark'>
                          {booking.User?.email}
                        </div>
                      </td>
                      <td className='whitespace-nowrap px-3 py-4 text-sm text-secondary-light dark:text-secondary-dark'>
                        <div className='font-medium text-primary-light dark:text-text-dark'>
                          {booking.Tour?.name}
                        </div>
                        <div className='flex items-center gap-2 mt-1 text-xs'>
                          <span className='flex items-center gap-1'>
                            <UserGroupIcon className='w-3 h-3' /> {booking.number_of_people}
                          </span>
                          <span>&bull;</span>
                          <span>{booking.Tour?.Destination?.name || 'Anywhere'}</span>
                        </div>
                      </td>
                      <td className='whitespace-nowrap px-3 py-4 text-sm'>
                        <div className='flex items-center gap-1 font-semibold text-green-600 dark:text-green-500'>
                          <CurrencyDollarIcon className='w-4 h-4' />
                          {booking.total_price}
                        </div>
                      </td>
                      <td className='whitespace-nowrap px-3 py-4 text-sm'>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[booking.status] ?? STATUS_BADGE.no_show}`}
                        >
                          {booking.status.replace('_', '-').toUpperCase()}
                        </span>
                        {booking.status === 'cancelled' && (
                          <div className='mt-1 max-w-48 truncate text-xs text-gray-500 dark:text-gray-400'>
                            {booking.cancelled_at &&
                              format(new Date(booking.cancelled_at), 'MMM dd')}
                            {booking.CancelledBy?.full_name &&
                              ` by ${booking.CancelledBy.full_name}`}
                            {booking.cancellation_reason && (
                              <span title={booking.cancellation_reason}>
                                {' '}
                                · {booking.cancellation_reason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6'>
                        <button
                          type='button'
                          onClick={() => setManaged(booking)}
                          aria-label={
                            booking.next_statuses?.length
                              ? `Manage booking #${booking.booking_id}`
                              : `History of booking #${booking.booking_id}`
                          }
                          className='inline-flex items-center gap-1 text-primary-light hover:text-primary-dark dark:text-primary-dark'
                        >
                          {booking.next_statuses?.length ? (
                            <>
                              <AdjustmentsHorizontalIcon className='w-4 h-4' /> Manage
                            </>
                          ) : (
                            <>
                              <ClockIcon className='w-4 h-4' /> History
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className='py-8 text-center text-sm text-gray-500'>
                        No bookings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className='mt-4 px-4 py-3 sm:px-6'>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  goToPrevPage={() => setPage((p) => Math.max(1, p - 1))}
                  goToNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {managed && <BookingStatusDialog booking={managed} onClose={() => setManaged(null)} />}
    </div>
  );
};

export default AdminBookingsPage;
