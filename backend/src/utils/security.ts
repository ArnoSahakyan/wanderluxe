import { createHash, randomBytes } from 'node:crypto';

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Escape untrusted text before interpolating it into HTML (e-mail templates). */
export const escapeHtml = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** Escape LIKE/ILIKE wildcards so user input is matched literally. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** `%term%` pattern for a case-insensitive "contains" search. */
export const containsPattern = (value: string): string => `%${escapeLike(value)}%`;

/** Unguessable one-time token (URL-safe). */
export const generateOpaqueToken = (): string => randomBytes(32).toString('base64url');

/** Tokens are stored hashed so a database leak cannot be replayed. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
