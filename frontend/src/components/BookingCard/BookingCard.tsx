import { FC } from 'react';
import { Link } from 'react-router-dom';
import { IBooking, ROUTES } from '../../shared';
import { formatDate } from '../../utils';
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  NoSymbolIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface BookingCardProps {
  booking: IBooking;
}

export const BookingCard: FC<BookingCardProps> = ({ booking }) => {
  const statusConfig = {
    confirmed: {
      color:
        'bg-green-50/95 text-green-700 ring-green-600/20 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-900/50',
      icon: CheckCircleIcon,
      label: 'Confirmed',
    },
    pending: {
      color:
        'bg-yellow-50/95 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/40 dark:text-yellow-300 dark:ring-yellow-900/50',
      icon: ClockIcon,
      label: 'Pending',
    },
    cancelled: {
      color:
        'bg-red-50/95 text-red-700 ring-red-600/20 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-900/50',
      icon: XCircleIcon,
      label: 'Cancelled',
    },
    completed: {
      color:
        'bg-blue-50/95 text-blue-700 ring-blue-600/20 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-900/50',
      icon: CheckCircleIcon,
      label: 'Completed',
    },
    no_show: {
      color:
        'bg-gray-50/95 text-gray-700 ring-gray-500/20 dark:bg-gray-800/80 dark:text-gray-300 dark:ring-gray-700',
      icon: NoSymbolIcon,
      label: 'No-show',
    },
    refunded: {
      color:
        'bg-purple-50/95 text-purple-700 ring-purple-600/20 dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-900/50',
      icon: ArrowUturnLeftIcon,
      label: 'Refunded',
    },
  };
  const isCancelled = booking.status === 'cancelled';

  const status = booking.status as keyof typeof statusConfig;
  const config = statusConfig[status] || {
    color: 'bg-gray-50/95 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-300',
    icon: ClockIcon,
    label: booking.status
      ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1)
      : 'Unknown',
  };
  const StatusIcon = config.icon;

  return (
    <div
      className={`flex h-40 w-full overflow-hidden rounded-lg border ${isCancelled ? 'opacity-75' : ''} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs transition-all hover:shadow-md`}
    >
      {/* Image Section (25% width) */}
      <div className='relative w-1/4 min-w-[120px]'>
        <img
          src={booking.image}
          alt={booking.tour_name}
          className={`h-full w-full object-cover ${isCancelled ? 'grayscale' : ''}`}
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://via.placeholder.com/300x160?text=WanderLuxe';
          }}
        />
        <span
          className={`absolute top-2 right-2 inline-flex items-center gap-x-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset shadow-xs backdrop-blur-md ${config.color}`}
        >
          <StatusIcon className='h-4 w-4' aria-hidden='true' />
          {config.label}
        </span>
      </div>

      {/* Content Section (75% width) */}
      <div className='flex w-3/4 flex-col justify-between p-4'>
        {/* Top Row - Title and Price */}
        <div className='flex justify-between'>
          <div>
            <h3 className='text-lg font-semibold text-primary-light dark:text-text-dark line-clamp-1'>
              {booking.tour_name}
            </h3>
            <p className='text-sm text-secondary-light dark:text-secondary-dark'>
              {booking.destination_name} • {formatDate(booking.start_date)} -{' '}
              {formatDate(booking.end_date)}
            </p>
          </div>
          <div className='text-right'>
            <p className='text-lg font-bold text-primary-light dark:text-text-dark'>
              ${booking.total_price}
            </p>
            <p className='text-xs text-secondary-light dark:text-secondary-dark'>
              {booking.number_of_people} {booking.number_of_people === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>

        {/* Bottom Row - Action Button */}
        <div className='flex items-center justify-between'>
          <div className='text-sm text-secondary-light dark:text-secondary-dark'>
            {isCancelled && booking.cancelled_at
              ? `Cancelled on ${new Date(booking.cancelled_at).toLocaleDateString()}`
              : `Booked on ${new Date(booking.booking_date).toLocaleDateString()}`}
          </div>
          <Link
            to={`${ROUTES.PROFILE_BOOKINGS}/${booking.booking_id}`}
            className='rounded-md bg-primary-light dark:bg-primary-dark px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-light/90 dark:hover:bg-primary-dark/90 transition-colors'
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};
