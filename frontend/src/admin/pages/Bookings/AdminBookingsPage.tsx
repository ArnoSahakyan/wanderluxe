import { useState } from 'react';
import { Loader, Pagination, ConfirmModal, ErrorState } from '../../../components';
import { useAdminBookings, useAdminCancelBooking, useAdminConfirmBooking } from '../../../hooks';
import { formatAxiosError } from '../../../utils';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import {
  CurrencyDollarIcon,
  UserGroupIcon,
  TrashIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const AdminBookingsPage = () => {
  const [page, setPage] = useState(1);
  const [cancelBookingId, setCancelBookingId] = useState<number | null>(null);
  const [confirmBookingId, setConfirmBookingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useAdminBookings(page);
  const cancelMutation = useAdminCancelBooking();
  const confirmMutation = useAdminConfirmBooking();

  const bookings = data?.bookings ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleCancelBooking = (id: number) => {
    setCancelBookingId(id);
  };

  const confirmCancelBooking = async () => {
    if (!cancelBookingId) return;
    try {
      await cancelMutation.mutateAsync(cancelBookingId);
      toast.success('Booking cancelled successfully');
    } catch (err) {
      toast.error(formatAxiosError(err) || 'Failed to cancel booking');
    } finally {
      setCancelBookingId(null);
    }
  };

  const handleConfirmBookingClick = (id: number) => {
    setConfirmBookingId(id);
  };

  const confirmPendingBooking = async () => {
    if (!confirmBookingId) return;
    try {
      await confirmMutation.mutateAsync(confirmBookingId);
      toast.success('Booking confirmed successfully');
    } catch (err) {
      toast.error(formatAxiosError(err) || 'Failed to confirm booking');
    } finally {
      setConfirmBookingId(null);
    }
  };

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
      </div>

      <div className='mt-8 flex flex-col'>
        <div className='-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8'>
          <div className='inline-block min-w-full py-2 align-middle md:px-6 lg:px-8'>
            <div className='overflow-hidden shadow ring-1 ring-black/5 md:rounded-lg'>
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
                    <tr key={booking.booking_id}>
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
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            booking.status === 'confirmed'
                              ? 'bg-green-50 text-green-700 ring-green-600/20'
                              : booking.status === 'pending'
                                ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                                : booking.status === 'cancelled'
                                  ? 'bg-red-50 text-red-700 ring-red-600/20'
                                  : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                          }`}
                        >
                          {booking.status.toUpperCase()}
                        </span>
                      </td>
                      <td className='relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6'>
                        <div className='flex justify-end gap-3'>
                          {booking.status === 'pending' && (
                            <button
                              onClick={() => handleConfirmBookingClick(booking.booking_id)}
                              title='Confirm Booking'
                              className='text-green-600 hover:text-green-900 flex items-center gap-1'
                            >
                              <CheckIcon className='w-4 h-4' /> Confirm
                            </button>
                          )}
                          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                            <button
                              onClick={() => handleCancelBooking(booking.booking_id)}
                              title='Cancel Booking'
                              className='text-red-600 hover:text-red-900 flex items-center gap-1'
                            >
                              <TrashIcon className='w-4 h-4' /> Cancel
                            </button>
                          )}
                        </div>
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

      <ConfirmModal
        isOpen={!!cancelBookingId}
        onClose={() => setCancelBookingId(null)}
        onConfirm={confirmCancelBooking}
        title='Cancel Booking'
        message='Are you sure you want to cancel this booking? This action cannot be undone.'
        confirmText='Cancel Booking'
        isLoading={cancelMutation.isPending}
      />

      <ConfirmModal
        isOpen={!!confirmBookingId}
        onClose={() => setConfirmBookingId(null)}
        onConfirm={confirmPendingBooking}
        title='Confirm Booking'
        message='Are you sure you want to confirm this booking?'
        confirmText='Confirm Booking'
        type='info'
        isLoading={confirmMutation.isPending}
      />
    </div>
  );
};

export default AdminBookingsPage;
