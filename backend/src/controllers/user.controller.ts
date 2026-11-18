import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { Op } from 'sequelize';
import type { z } from 'zod';
import { config } from '../config/env';
import { Booking, Favorite, Review, Role, Tour, User } from '../db/models';
import { revokeAllSessions, startSession } from '../lib/sessions';
import type { AuthenticatedRequest, IPaginationQuery, TypedRequest } from '../types';
import { AppError, BadRequestError, NotFoundError, getPagination, toPublicUser, totalPages } from '../utils';
import type * as v from '../validators';
import { emailEquals } from './auth.controller';

type UserIdParams = { user_id: number };

const assertEmailAvailable = async (email: string, exceptUserId: number) => {
    const taken = await User.findOne({
        where: { [Op.and]: [emailEquals(email), { user_id: { [Op.ne]: exceptUserId } }] },
        paranoid: false,
    });
    if (taken) throw new AppError(409, 'Email already in use.');
};

export const updatePersonalInfo = async (
    req: AuthenticatedRequest<{}, {}, z.infer<typeof v.updatePersonalInfoBody>>,
    res: Response,
): Promise<void> => {
    const { full_name, email, phone_number } = req.body;

    const user = await User.findByPk(req.user_id, { include: [{ model: Role, as: 'Role', attributes: ['name'] }] });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (email.toLowerCase() !== user.email.toLowerCase()) {
        await assertEmailAvailable(email, user.user_id);
    }

    user.full_name = full_name;
    user.email = email;
    if (phone_number !== undefined) {
        user.phone_number = phone_number;
    }

    await user.save();

    res.json({
        message: 'Personal information updated successfully',
        user: { ...toPublicUser(user), role: user.Role?.name },
    });
};

export const changePassword = async (
    req: AuthenticatedRequest<{}, {}, z.infer<typeof v.changePasswordBody>>,
    res: Response,
): Promise<void> => {
    const { current_password, new_password } = req.body;

    const user = await User.findByPk(req.user_id);
    if (!user) {
        throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(current_password, user.password);
    if (!isMatch) {
        throw new BadRequestError('Incorrect current password');
    }

    user.password = await bcrypt.hash(new_password, config.bcryptRounds);
    user.password_changed_at = new Date();
    await user.save();

    // Sign out every other device; this browser continues with a fresh session.
    await revokeAllSessions(user.user_id);
    await startSession(res, user.user_id);

    res.json({ message: 'Password changed successfully' });
};

// --- Admin Controls ---

export const getAllUsers = async (req: TypedRequest<{}, {}, {}, IPaginationQuery>, res: Response): Promise<void> => {
    const { page, limit, offset } = getPagination(req.query);

    const { count, rows } = await User.findAndCountAll({
        include: [{ model: Role, as: 'Role' }],
        attributes: { exclude: ['password', 'reset_password_token', 'reset_token_expires', 'password_changed_at'] },
        order: [['created_at', 'DESC']],
        limit,
        offset,
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        users: rows,
    });
};

export const getUserById = async (req: TypedRequest<UserIdParams>, res: Response): Promise<void> => {
    const user = await User.findByPk(req.params.user_id, {
        include: [{ model: Role, as: 'Role' }],
        attributes: { exclude: ['password', 'reset_password_token', 'reset_token_expires', 'password_changed_at'] },
    });

    if (!user) {
        throw new NotFoundError('User not found');
    }

    res.status(200).json(user);
};

/** Admins cannot demote themselves (prevents locking the last admin out). */
const assertNotSelfDemotion = async (req: Pick<AuthenticatedRequest<UserIdParams>, 'params' | 'user_id'>, role: Role) => {
    if (req.params.user_id === req.user_id && role.name !== 'admin') {
        throw new BadRequestError('You cannot remove your own admin role.');
    }
};

export const updateUserRole = async (
    req: AuthenticatedRequest<UserIdParams, {}, z.infer<typeof v.updateUserRoleBody>>,
    res: Response,
): Promise<void> => {
    const role = await Role.findByPk(req.body.role_id);
    if (!role) {
        throw new BadRequestError('Invalid role ID');
    }
    await assertNotSelfDemotion(req, role);

    const user = await User.findByPk(req.params.user_id);
    if (!user) {
        throw new NotFoundError('User not found');
    }

    user.role_id = role.role_id;
    await user.save();

    res.status(200).json({ message: 'User role updated successfully', user: toPublicUser(user) });
};

export const updateUserAdmin = async (
    req: AuthenticatedRequest<UserIdParams, {}, z.infer<typeof v.updateUserAdminBody>>,
    res: Response,
): Promise<void> => {
    const { full_name, email, phone_number, role_id } = req.body;

    const role = await Role.findByPk(role_id);
    if (!role) {
        throw new BadRequestError('Invalid role ID');
    }
    await assertNotSelfDemotion(req, role);

    const user = await User.findByPk(req.params.user_id);
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (email.toLowerCase() !== user.email.toLowerCase()) {
        await assertEmailAvailable(email, user.user_id);
    }

    user.full_name = full_name;
    user.email = email;
    user.role_id = role_id;
    if (phone_number !== undefined) {
        user.phone_number = phone_number;
    }

    await user.save();
    await user.reload({ include: [{ model: Role, as: 'Role' }] });

    res.status(200).json({ message: 'User updated successfully', user: toPublicUser(user) });
};

export const deleteUser = async (req: AuthenticatedRequest<UserIdParams>, res: Response): Promise<void> => {
    if (req.params.user_id === req.user_id) {
        throw new BadRequestError('You cannot delete your own account.');
    }

    const deleted = await User.destroy({ where: { user_id: req.params.user_id } });

    if (!deleted) {
        throw new NotFoundError('User not found');
    }
    await revokeAllSessions(req.params.user_id);

    res.status(200).json({ message: 'User deleted successfully' });
};

export const getUserStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user_id = req.user_id;

    const [totalBookings, totalReviews, totalFavorites, recentBookings] = await Promise.all([
        // Cancelled bookings stay as history but don't count towards the member rank.
        Booking.count({ where: { user_id, status: { [Op.ne]: 'cancelled' } } }),
        Review.count({ where: { user_id } }),
        Favorite.count({ where: { user_id } }),
        Booking.findAll({
            where: { user_id },
            limit: 3,
            order: [['created_at', 'DESC']],
            include: [{ model: Tour, attributes: ['name', 'tour_id'] }],
        }),
    ]);

    // Member rank (unchanged business rule)
    let rank = 'Explorer';
    if (totalBookings >= 6) rank = 'Legend';
    else if (totalBookings >= 2) rank = 'Voyager';

    res.status(200).json({
        stats: {
            totalBookings,
            totalReviews,
            totalFavorites,
            rank,
        },
        recentBookings,
    });
};
