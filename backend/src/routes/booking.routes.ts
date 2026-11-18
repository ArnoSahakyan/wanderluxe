import express from 'express';
import {
    cancelBooking,
    createBooking,
    getAllBookings,
    getBookingById,
    getUsersBookings,
    confirmBooking,
    getBookingHistory,
    updateBookingStatus,
} from '../controllers/booking.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const bookingId = validate({ params: v.idParam('booking_id') });

router.get('/my', verifyToken, validate({ query: v.myBookingsQuery }), asHandler(getUsersBookings));
router.get('/', verifyToken, isAdmin, validate({ query: v.adminBookingsQuery }), asHandler(getAllBookings));
router.get('/:booking_id', verifyToken, bookingId, asHandler(getBookingById));
router.post('/', verifyToken, validate({ body: v.createBookingBody }), asHandler(createBooking));
const cancel = [verifyToken, bookingId, validate({ body: v.cancelBookingBody }), asHandler(cancelBooking)];
router.patch('/:booking_id/cancel', ...cancel);
// Older clients cancel with DELETE; the booking is kept either way.
router.delete('/:booking_id', ...cancel);
router.patch('/:booking_id/confirm', verifyToken, isAdmin, bookingId, asHandler(confirmBooking));
router.patch(
    '/:booking_id/status',
    verifyToken,
    isAdmin,
    bookingId,
    validate({ body: v.bookingStatusBody }),
    asHandler(updateBookingStatus),
);
router.get('/:booking_id/history', verifyToken, isAdmin, bookingId, asHandler(getBookingHistory));

export default router;
