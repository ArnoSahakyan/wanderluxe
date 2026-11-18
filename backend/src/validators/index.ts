/**
 * Request schemas for every route. Shapes mirror what the SPA already sends,
 * so no client change is required; unknown keys are stripped.
 */
import { z } from 'zod';

// ── building blocks ───────────────────────────────────────────────────────────
const emptyToUndefined = (v: unknown) => (v === '' || v === null || v === 'null' || v === 'undefined' ? undefined : v);

export const id = z.coerce.number({ error: 'must be a number' }).int('must be an integer').positive('must be positive');
const optionalId = z.preprocess(emptyToUndefined, id.optional());
const nullableId = z.preprocess((v) => (v === '' || v === 'null' ? null : v), id.nullable().optional());

const text = (max: number) => z.string().trim().max(max, `must be at most ${max} characters`);
const requiredText = (max: number) => text(max).min(1, 'is required');
const optionalText = (max: number) => z.preprocess((v) => (v === null ? undefined : v), text(max).optional());

export const email = z.string().trim().toLowerCase().pipe(z.email('must be a valid e-mail address').max(254));

/** Same rules the SPA enforces on sign-up / reset / change password. */
export const strongPassword = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character');

/** undefined = leave unchanged, null/'' = clear, string = set. */
const phone = z.preprocess(
    (v) => (v === '' ? null : v),
    z
        .string()
        .trim()
        .max(30, 'must be at most 30 characters')
        .regex(/^[+\d\s().-]*$/, 'contains invalid characters')
        .nullable()
        .optional(),
);

const formBoolean = z.preprocess((v) => {
    if (v === 'true' || v === '1' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === '') return false;
    return v;
}, z.boolean());

const date = z.coerce.date({ error: 'must be a valid date' });

// ── shared ────────────────────────────────────────────────────────────────────
export const pagination = z.object({
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100_000).optional()),
    limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).optional()),
});

export const searchablePagination = pagination.extend({
    search: z.preprocess(emptyToUndefined, text(100).optional()),
});

export const idParam = (name: string) => z.object({ [name]: id });

// ── auth ──────────────────────────────────────────────────────────────────────
export const signUpBody = z.object({
    full_name: requiredText(100),
    email,
    password: strongPassword,
    phone_number: phone,
});

export const signInBody = z.object({
    email,
    password: z.string().min(1, 'is required').max(128),
});

export const emailBody = z.object({ email });

export const resetPasswordQuery = z.object({ token: z.string().min(1, 'Reset token is required.').max(200) });
export const resetPasswordBody = z.object({ new_password: strongPassword });

// ── account ───────────────────────────────────────────────────────────────────
export const updatePersonalInfoBody = z.object({
    full_name: requiredText(100),
    email,
    phone_number: phone,
});

export const changePasswordBody = z.object({
    current_password: z.string().min(1, 'is required').max(128),
    new_password: strongPassword,
});

export const updateUserRoleBody = z.object({ role_id: id });

export const updateUserAdminBody = updatePersonalInfoBody.extend({ role_id: id });

// ── bookings ──────────────────────────────────────────────────────────────────
export const createBookingBody = z.object({
    tour_id: id,
    number_of_people: z.coerce.number().int('must be a whole number').min(1).max(100),
});

// ── categories ────────────────────────────────────────────────────────────────
export const categoryBody = z.object({ name: requiredText(255) });

// ── contact ───────────────────────────────────────────────────────────────────
export const contactBody = z.object({
    full_name: requiredText(100),
    email,
    phone_number: z.string().trim().min(1, 'is required').max(30).regex(/^[+\d\s().-]+$/, 'contains invalid characters'),
    message: requiredText(5000),
});

export const contactStatusBody = z.object({ status: z.enum(['unread', 'read', 'replied'], { error: 'Invalid status' }) });

// ── destinations ──────────────────────────────────────────────────────────────
export const createDestinationBody = z.object({
    name: requiredText(255),
    description: optionalText(5000),
});
export const updateDestinationBody = createDestinationBody.partial();

// ── favourites ────────────────────────────────────────────────────────────────
export const favoriteBody = z.object({ tour_id: id });

// ── newsletter ────────────────────────────────────────────────────────────────
export const tokenQuery = z.object({ token: z.string().min(1, 'Token is required.').max(200) });
export const unsubscribeQuery = z.object({ email: z.preprocess(emptyToUndefined, email.optional()) });

// ── posts ─────────────────────────────────────────────────────────────────────
export const createPostBody = z.object({
    title: requiredText(255),
    slug: z.preprocess(emptyToUndefined, text(255).optional()),
    excerpt: optionalText(1000),
    content: optionalText(200_000),
    is_published: z.preprocess(emptyToUndefined, formBoolean.optional()),
});
export const updatePostBody = createPostBody.partial();
export const slugParam = z.object({ slug: requiredText(255) });

// ── reviews ───────────────────────────────────────────────────────────────────
export const createReviewBody = z.object({
    tour_id: id,
    rating: z.coerce.number().int('must be a whole number').min(1, 'must be between 1 and 5').max(5, 'must be between 1 and 5'),
    comment: optionalText(2000),
});

// ── search ────────────────────────────────────────────────────────────────────
export const searchQuery = z.object({
    query: z.string({ error: 'Query parameter is required.' }).trim().min(1, 'Query parameter is required.').max(100),
    limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).default(5)),
});

// ── tours ─────────────────────────────────────────────────────────────────────
const tourFields = z.object({
    name: requiredText(255),
    description: optionalText(10_000),
    price: z.coerce.number({ error: 'must be a number' }).min(0, 'cannot be negative').max(99_999_999.99),
    available_spots: z.coerce.number().int('must be a whole number').min(0, 'cannot be negative').max(100_000),
    start_date: date,
    end_date: date,
    category_id: nullableId,
    destination_id: nullableId,
});

const datesInOrder = (t: { start_date: Date; end_date: Date }) => t.end_date >= t.start_date;
const datesMessage = { message: 'End date must be on or after the start date', path: ['end_date'] };

export const tourBody = tourFields.refine(datesInOrder, datesMessage);

export const tourListQuery = searchablePagination.extend({
    category_id: optionalId,
    destination_id: optionalId,
});

export const tourByIdQuery = z.object({ user_id: optionalId });

export const coverImageBody = z.object({ tour_id: id, image_id: id });
export const tourImageParams = z.object({ tour_id: id, image_id: id });
