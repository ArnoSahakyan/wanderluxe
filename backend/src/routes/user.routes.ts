import express from 'express';
import {
    updatePersonalInfo,
    changePassword,
    getAllUsers,
    getUserById,
    updateUserRole,
    deleteUser,
    updateUserAdmin,
    getUserStats,
} from '../controllers/user.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rateLimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const userId = validate({ params: v.idParam('user_id') });

router.put('/info', verifyToken, validate({ body: v.updatePersonalInfoBody }), asHandler(updatePersonalInfo));
router.put('/password', verifyToken, authLimiter, validate({ body: v.changePasswordBody }), asHandler(changePassword));
router.get('/stats', verifyToken, asHandler(getUserStats));

// Admin routes
router.get('/', verifyToken, isAdmin, validate({ query: v.pagination }), asHandler(getAllUsers));
router.get('/:user_id', verifyToken, isAdmin, userId, asHandler(getUserById));
router.patch(
    '/:user_id/role',
    verifyToken,
    isAdmin,
    validate({ params: v.idParam('user_id'), body: v.updateUserRoleBody }),
    asHandler(updateUserRole),
);
router.put(
    '/:user_id',
    verifyToken,
    isAdmin,
    validate({ params: v.idParam('user_id'), body: v.updateUserAdminBody }),
    asHandler(updateUserAdmin),
);
router.delete('/:user_id', verifyToken, isAdmin, userId, asHandler(deleteUser));

export default router;
