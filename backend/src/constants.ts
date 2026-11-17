import { config } from './config/env';

export const TOURS_BUCKET = config.storage.buckets.tours;
export const DESTINATIONS_BUCKET = config.storage.buckets.destinations;
export const BLOGS_BUCKET = config.storage.buckets.blogs;

/** Lifetime of password-reset and newsletter-confirmation links. */
export const EXPIRATION_TIME = 60 * 60 * 1000;

/** Customers may cancel up to this many days before a tour starts (admins any time). */
export const CANCELLATION_MIN_DAYS = 3;
