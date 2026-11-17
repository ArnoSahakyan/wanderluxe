'use strict';

/**
 * The production dump inserts rows with explicit ids but never advances the
 * sequences, so the next INSERT would reuse id 1 and fail. This sets every
 * serial sequence to MAX(id) and attaches it to its column (OWNED BY).
 *
 * Safe to re-run: setval only ever moves forward (GREATEST with the current
 * value) and no row is touched.
 */
const SERIALS = [
  ['roles', 'role_id', 'roles_role_id_seq'],
  ['users', 'user_id', 'users_user_id_seq'],
  ['destinations', 'destination_id', 'destinations_destination_id_seq'],
  ['categories', 'category_id', 'categories_category_id_seq'],
  ['tours', 'tour_id', 'tours_tour_id_seq'],
  ['tour_images', 'image_id', 'tour_images_image_id_seq'],
  ['bookings', 'booking_id', 'bookings_booking_id_seq'],
  ['favorites', 'favorite_id', 'favorites_favorite_id_seq'],
  ['reviews', 'review_id', 'reviews_review_id_seq'],
  ['newsletter_subscribers', 'subscriber_id', 'newsletter_subscribers_subscriber_id_seq'],
  ['newsletter_verifications', 'id', 'newsletter_verifications_id_seq'],
  ['posts', 'post_id', 'posts_post_id_seq'],
];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    for (const [table, column, seq] of SERIALS) {
      const [[{ exists }]] = await q.query(`SELECT to_regclass('public."${seq}"') IS NOT NULL AS exists`);
      if (!exists) continue; // databases created by the original migrations use other names via SERIAL
      await q.query(`ALTER SEQUENCE "${seq}" OWNED BY "${table}"."${column}"`);
      // next nextval() returns MAX(id)+1 (or 1 for an empty table); never moves backwards
      await q.query(`
        WITH s AS (
          SELECT (SELECT COALESCE(MAX("${column}"), 0) FROM "${table}") AS max_id,
                 CASE WHEN is_called THEN last_value ELSE 0 END AS used
          FROM "${seq}"
        )
        SELECT setval('"${seq}"', GREATEST(max_id, used, 1), GREATEST(max_id, used) > 0) FROM s`);
    }
  },

  async down(queryInterface) {
    // Sequence values are never moved backwards (that would cause duplicate ids).
    for (const [, , seq] of SERIALS) {
      await queryInterface.sequelize.query(
        `DO $$ BEGIN IF to_regclass('public."${seq}"') IS NOT NULL THEN ALTER SEQUENCE "${seq}" OWNED BY NONE; END IF; END $$;`,
      );
    }
  },
};
