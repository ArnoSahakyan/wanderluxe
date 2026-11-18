import type { AdminBookingStatus } from '../../../api';

export const STATUS_LABELS: Record<AdminBookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  refunded: 'Refunded',
};

/** What each move does, shown next to the choice in the status dialog. */
export const STATUS_HINTS: Partial<Record<AdminBookingStatus, string>> = {
  confirmed: 'The customer is told their place is confirmed.',
  completed: 'The trip happened. The customer can now review the tour.',
  cancelled: 'The seats go back on sale. The note is shown to the customer as the reason.',
  no_show: 'The customer did not turn up. The seats are not released.',
  refunded: 'The payment was returned after the trip.',
};

export const STATUS_BADGE: Record<AdminBookingStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  confirmed: 'bg-green-50 text-green-700 ring-green-600/20',
  completed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
  no_show: 'bg-gray-50 text-gray-600 ring-gray-500/10',
  refunded: 'bg-purple-50 text-purple-700 ring-purple-600/20',
};
