import { api } from './axios.ts';
import { ITourFilters } from '../shared';

export const fetchUserBookings = async (filters: ITourFilters) => {
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

export const cancelBooking = async (booking_id: number) => {
  const response = await api.delete(`/booking/${booking_id}`);
  return response.data;
};

export const confirmBooking = async (booking_id: number) => {
  const response = await api.patch(`/booking/${booking_id}/confirm`);
  return response.data;
};

export type AdminBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'refunded';

/** Booking as returned by the admin list (GET /booking): nested User and Tour. */
export interface AdminBooking {
  booking_id: number;
  booking_date: string;
  number_of_people: number;
  total_price: string;
  status: AdminBookingStatus;
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

export const fetchAllBookings = async (page = 1, limit = 10): Promise<AdminBookingsResponse> => {
  const response = await api.get(`/booking?page=${page}&limit=${limit}`);
  return response.data;
};
