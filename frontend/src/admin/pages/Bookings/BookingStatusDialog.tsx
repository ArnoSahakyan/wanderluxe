import { FC, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import type { AdminBooking, AdminBookingStatus } from '../../../api';
import { useAdminUpdateBookingStatus, useBookingHistory } from '../../../hooks';
import { formatAxiosError } from '../../../utils';
import { STATUS_HINTS, STATUS_LABELS } from './bookingStatus';

interface BookingStatusDialogProps {
  booking: AdminBooking;
  onClose: () => void;
}

/** Change a booking's status (only to the allowed next states) and see its history. */
export const BookingStatusDialog: FC<BookingStatusDialogProps> = ({ booking, onClose }) => {
  const options = booking.next_statuses ?? [];
  const [status, setStatus] = useState<AdminBookingStatus | ''>(options[0] ?? '');
  const [note, setNote] = useState('');
  const mutation = useAdminUpdateBookingStatus();
  const { data, isLoading } = useBookingHistory(booking.booking_id);

  const submit = async () => {
    if (!status) return;
    try {
      await mutation.mutateAsync({ booking_id: booking.booking_id, status, note });
      toast.success(`Booking #${booking.booking_id} is now ${STATUS_LABELS[status].toLowerCase()}`);
      onClose();
    } catch (err) {
      toast.error(formatAxiosError(err) || 'Failed to update the booking');
    }
  };

  return (
    <Dialog open onClose={mutation.isPending ? () => {} : onClose} className='relative z-50'>
      <div className='fixed inset-0 bg-black/30 dark:bg-black/50' aria-hidden='true' />
      <div className='fixed inset-0 flex items-center justify-center p-4'>
        <DialogPanel className='w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-background-dark'>
          <DialogTitle
            as='h2'
            className='text-lg font-medium text-primary-light dark:text-primary-dark'
          >
            Booking #{booking.booking_id}
          </DialogTitle>
          <p className='mt-1 text-sm text-secondary-light dark:text-secondary-dark'>
            {booking.Tour?.name} · {booking.User?.full_name} · currently{' '}
            <strong>{STATUS_LABELS[booking.status]}</strong>
          </p>

          {options.length > 0 ? (
            <div className='mt-5 space-y-4'>
              <fieldset>
                <legend className='form-label'>New status</legend>
                <div className='mt-2 space-y-2'>
                  {options.map((option) => (
                    <label
                      key={option}
                      className='flex cursor-pointer items-start gap-3 rounded-md p-2 ring-1 ring-gray-200 dark:ring-gray-700'
                    >
                      <input
                        type='radio'
                        name='booking-status'
                        value={option}
                        checked={status === option}
                        onChange={() => setStatus(option)}
                        className='mt-1'
                      />
                      <span>
                        <span className='block text-sm font-medium text-primary-light dark:text-text-dark'>
                          {STATUS_LABELS[option]}
                        </span>
                        <span className='block text-xs text-secondary-light dark:text-secondary-dark'>
                          {STATUS_HINTS[option]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor='status-note' className='form-label'>
                  Note (optional)
                </label>
                <textarea
                  id='status-note'
                  rows={2}
                  maxLength={255}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className='form-input'
                />
              </div>
            </div>
          ) : (
            <p className='mt-5 text-sm text-secondary-light dark:text-secondary-dark'>
              This booking is final; its status can no longer change.
            </p>
          )}

          <section className='mt-6' aria-labelledby='history-heading'>
            <h3
              id='history-heading'
              className='text-sm font-semibold text-primary-light dark:text-text-dark'
            >
              History
            </h3>
            {isLoading ? (
              <p className='mt-2 text-sm text-gray-500'>Loading…</p>
            ) : data?.history.length ? (
              <ol className='mt-2 max-h-48 space-y-2 overflow-y-auto text-sm'>
                {data.history.map((entry) => (
                  <li key={entry.id} className='text-secondary-light dark:text-secondary-dark'>
                    <span className='font-medium text-primary-light dark:text-text-dark'>
                      {entry.from_status
                        ? `${STATUS_LABELS[entry.from_status]} → ${STATUS_LABELS[entry.to_status]}`
                        : `Booked (${STATUS_LABELS[entry.to_status]})`}
                    </span>{' '}
                    · {format(new Date(entry.changed_at), 'MMM dd, yyyy HH:mm')} ·{' '}
                    {entry.ChangedBy?.full_name ?? 'System'}
                    {entry.note && <span className='block text-xs'>“{entry.note}”</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className='mt-2 text-sm text-gray-500'>
                No changes recorded yet (bookings made before history was kept).
              </p>
            )}
          </section>

          <div className='mt-6 flex justify-end gap-3'>
            <button
              type='button'
              onClick={onClose}
              disabled={mutation.isPending}
              className='rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            >
              Close
            </button>
            {options.length > 0 && (
              <button
                type='button'
                onClick={submit}
                disabled={!status || mutation.isPending}
                className='rounded-md bg-primary-light px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50'
              >
                {mutation.isPending ? 'Saving…' : 'Update status'}
              </button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
