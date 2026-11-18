/**
 * Demo accounts for portfolio visitors ("Try as customer" / "Try as admin").
 *
 * - Two ordinary users identified by e-mail (DEMO_CUSTOMER_EMAIL / DEMO_ADMIN_EMAIL),
 *   created by `npm run db:demo-users`. Their passwords are random and never shown:
 *   the only way in is POST /api/auth/demo, available while DEMO_MODE=true.
 * - Their access tokens carry `demo: true`, and verifyToken then limits them:
 *   the demo admin is read-only and sees other people's personal data masked;
 *   the demo customer may book, cancel, favourite and review, but cannot change
 *   the account itself.
 * - The demo customer's bookings, reviews and favourites are removed 24 h after
 *   they were made (on the next demo sign-in), so seats go back on sale.
 * The restrictions follow the e-mail address, so they also apply with DEMO_MODE off.
 */
import { Op, col, where } from 'sequelize';
import { Booking, Favorite, Review, Tour, sequelize } from '../db/models';
import { type DemoRole, isDemoEmail } from '../utils/demoAccounts';
import { logger } from './logger';

export { type DemoRole, demoEmail, isDemoEmail } from '../utils/demoAccounts';

export const DEMO_READ_ONLY_MESSAGE = 'This is a demo account, so this change is turned off. Sign up to try it for real.';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** What the demo customer may change: only their own trip activity. */
const CUSTOMER_WRITABLE = /^\/api\/(booking|favorite|review)(\/|$)/;

export const isDemoWriteAllowed = (method: string, path: string, role: DemoRole): boolean =>
    SAFE_METHODS.has(method.toUpperCase()) || (role === 'customer' && CUSTOMER_WRITABLE.test(path));

// ── Masking for the demo admin ───────────────────────────────────────────────
const maskEmail = (email: string) => {
    const [local, domain] = email.split('@');
    return domain ? `${local.slice(0, 1)}•••@${domain}` : '•••';
};
const maskName = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1)}.`)
        .join(' ');

const MASKERS: Record<string, (value: string) => string> = {
    email: maskEmail,
    full_name: maskName,
    phone_number: () => '•••',
    phone: () => '•••',
};
/** Contact-form messages are private too; other `message` keys are API status texts. */
const maskMessage = (row: Record<string, unknown>, key: string) => key === 'message' && 'contact_id' in row;

/**
 * Deep copy of a JSON body with personal fields masked, so visitors browsing
 * the admin area never see real customers' contact details or messages.
 */
export const maskPersonalData = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(maskPersonalData);
    if (value && typeof value === 'object') {
        const source =
            typeof (value as { toJSON?: unknown }).toJSON === 'function'
                ? (value as { toJSON: () => unknown }).toJSON()
                : value;
        if (source !== value) return maskPersonalData(source);
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, v]) => {
                if (typeof v === 'string' && v.length > 0 && !isDemoEmail(v)) {
                    if (maskMessage(value as Record<string, unknown>, key)) return [key, '(hidden in the demo)'];
                    const mask = MASKERS[key];
                    if (mask) return [key, mask(v)];
                }
                return [key, maskPersonalData(v)];
            }),
        );
    }
    return value;
};

const DEMO_DATA_TTL_MS = 24 * 60 * 60 * 1000;

/** Removes the demo customer's activity older than 24 h and releases the seats. */
export const cleanUpDemoCustomer = async (userId: number) => {
    const cutoff = new Date(Date.now() - DEMO_DATA_TTL_MS);
    // created_at is a column on every table here, but not a declared model attribute on all of them.
    const olderThanCutoff = { user_id: userId, [Op.and]: [where(col('created_at'), Op.lt, cutoff)] };
    try {
        await sequelize.transaction(async (transaction) => {
            const bookings = await Booking.findAll({
                where: olderThanCutoff,
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            for (const booking of bookings) {
                await Tour.increment('available_spots', {
                    by: booking.number_of_people,
                    where: { tour_id: booking.tour_id },
                    transaction,
                });
                await booking.destroy({ transaction });
            }
            await Review.destroy({ where: olderThanCutoff, transaction });
            await Favorite.destroy({ where: olderThanCutoff, transaction });
        });
    } catch (err) {
        // Never block the demo sign-in because of housekeeping.
        logger.warn('Demo clean-up failed', { err });
    }
};
