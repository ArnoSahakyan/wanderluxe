export type BookingStatus =
  'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'refunded';

/** How "My Bookings" splits a customer's bookings (GET /booking/my?view=). */
export type BookingView = 'upcoming' | 'past' | 'cancelled';

export interface IBooking {
  booking_id: number;
  booking_date: string;
  number_of_people: number;
  total_price: string;
  status: BookingStatus;
  /** Set only on cancelled bookings. */
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by_customer?: boolean;
  tour_id?: number;
  tour_name: string;
  start_date: string;
  end_date: string;
  destination_name: string;
  category_name: string;
  image: string;
}
