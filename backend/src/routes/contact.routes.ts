import express from 'express';
import {
    sendMessage,
    getAllMessages,
    getMessageById,
    updateMessageStatus,
    deleteMessage,
} from '../controllers/contact.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { formLimiter } from '../middlewares/rateLimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const contactId = validate({ params: v.idParam('contact_id') });

router.post('/', formLimiter, validate({ body: v.contactBody }), asHandler(sendMessage));
router.get('/', verifyToken, isAdmin, validate({ query: v.pagination }), asHandler(getAllMessages));
router.get('/:contact_id', verifyToken, isAdmin, contactId, asHandler(getMessageById));
router.put(
    '/:contact_id/status',
    verifyToken,
    isAdmin,
    validate({ params: v.idParam('contact_id'), body: v.contactStatusBody }),
    asHandler(updateMessageStatus),
);
router.delete('/:contact_id', verifyToken, isAdmin, contactId, asHandler(deleteMessage));

export default router;
