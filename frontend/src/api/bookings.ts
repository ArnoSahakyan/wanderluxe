import { api } from './axios.ts';
import type { BookingStatus, BookingView, ITourFilters } from '../shared';

export const fetchUserBookings = async (filters: ITourFilters & { view?: BookingView }) => {
  const response = await api.get(`/booking/my`, {
    params: filters,
  });
  return response.data;
};

export const fetchBooking = async (id: number) => {
  const response = await api.get(`/booking/${id}`);
  return response.data;
};

export const createBooking = async (tour_id: number, number_of_people: number) => {
  const response = await api.post('/booking', { tour_id, number_of_people });
  return response.data;
};

export interface CancelBookingInput {
  booking_id: number;
  reason?: string;
}

/** Cancels a booking; it stays in the history with status "cancelled". */
export const cancelBooking = async ({ booking_id, reason }: CancelBookingInput) => {
  const response = await api.patch(`/booking/${booking_id}/cancel`, {
    reason: reason?.trim() || undefined,
  });
  return response.data;
};

export type AdminBookingStatus = BookingStatus;

/** Booking as returned by the admin list (GET /booking): nested User and Tour. */
export interface AdminBooking {
  booking_id: number;
  booking_date: string;
  number_of_people: number;
  total_price: string;
  status: AdminBookingStatus;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  CancelledBy?: { user_id: number; full_name: string } | null;
  /** The statuses an admin may move this booking to next. */
  next_statuses?: AdminBookingStatus[];
  User: {
    user_id: number;
    full_name: string;
    email: string;
  };
  Tour: {
    tour_id: number;
    name: string;
    Destination?: { name: string };
    Category?: { name: string };
  };
}

export interface AdminBookingsResponse {
  total: number;
  page: number;
  totalPages: number;
  bookings: AdminBooking[];
}

export const fetchAllBookings = async (
  page = 1,
  limit = 10,
  status?: AdminBookingStatus,
): Promise<AdminBookingsResponse> => {
  const response = await api.get('/booking', { params: { page, limit, status } });
  return response.data;
};

export interface UpdateBookingStatusInput {
  booking_id: number;
  status: AdminBookingStatus;
  note?: string;
}

/** Admin: move a booking along its lifecycle (pending → confirmed → completed, ...). */
export const updateBookingStatus = async ({
  booking_id,
  status,
  note,
}: UpdateBookingStatusInput) => {
  const response = await api.patch(`/booking/${booking_id}/status`, {
    status,
    note: note?.trim() || undefined,
  });
  return response.data;
};

export interface BookingHistoryEntry {
  id: number;
  from_status: AdminBookingStatus | null;
  to_status: AdminBookingStatus;
  note: string | null;
  changed_at: string;
  ChangedBy?: { user_id: number; full_name: string } | null;
}

export const fetchBookingHistory = async (
  booking_id: number,
): Promise<{ history: BookingHistoryEntry[] }> => {
  const response = await api.get(`/booking/${booking_id}/history`);
  return response.data;
};
