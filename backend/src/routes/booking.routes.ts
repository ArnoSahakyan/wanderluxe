import express from 'express';
import {
    cancelBooking,
    createBooking,
    getAllBookings,
    getBookingById,
    getUsersBookings,
    confirmBooking,
} from '../controllers/booking.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const bookingId = validate({ params: v.idParam('booking_id') });

router.get('/my', verifyToken, validate({ query: v.pagination }), asHandler(getUsersBookings));
router.get('/', verifyToken, isAdmin, validate({ query: v.pagination }), asHandler(getAllBookings));
router.get('/:booking_id', verifyToken, bookingId, asHandler(getBookingById));
router.post('/', verifyToken, validate({ body: v.createBookingBody }), asHandler(createBooking));
router.delete('/:booking_id', verifyToken, bookingId, asHandler(cancelBooking));
router.patch('/:booking_id/confirm', verifyToken, isAdmin, bookingId, asHandler(confirmBooking));

export default router;
