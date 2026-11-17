import type { User } from '../db/models';

const SENSITIVE_USER_FIELDS = ['password', 'reset_password_token', 'reset_token_expires', 'password_changed_at'] as const;

/**
 * Plain user object safe to send to clients: never contains the password hash
 * or reset-token data. Keeps every other field the API returned before.
 */
export const toPublicUser = (user: User) => {
    const json = user.toJSON() as unknown as Record<string, unknown>;
    for (const field of SENSITIVE_USER_FIELDS) delete json[field];
    return json;
};
