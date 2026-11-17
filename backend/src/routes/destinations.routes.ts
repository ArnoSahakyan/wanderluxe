import express from 'express';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware';
import {
    createDestination,
    getAllDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination,
} from '../controllers/destinations.controller';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const destinationId = validate({ params: v.idParam('id') });

router.get('/', validate({ query: v.searchablePagination }), asHandler(getAllDestinations));
router.get('/:id', destinationId, asHandler(getDestinationById));
router.post('/', verifyToken, isAdmin, upload, validate({ body: v.createDestinationBody }), asHandler(createDestination));
router.put(
    '/:id',
    verifyToken,
    isAdmin,
    upload,
    validate({ params: v.idParam('id'), body: v.updateDestinationBody }),
    asHandler(updateDestination),
);
router.delete('/:id', verifyToken, isAdmin, destinationId, asHandler(deleteDestination));

export default router;
