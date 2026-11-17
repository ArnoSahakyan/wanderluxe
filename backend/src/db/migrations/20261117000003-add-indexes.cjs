'use strict';

/** Indexes for foreign keys and frequent lookups. Purely additive. */
const INDEXES = [
  ['bookings', 'bookings_user_id_idx', '(user_id)'],
  ['bookings', 'bookings_tour_id_idx', '(tour_id)'],
  ['bookings', 'bookings_booking_date_idx', '(booking_date DESC)'],
  ['favorites', 'favorites_tour_id_idx', '(tour_id)'],
  ['reviews', 'reviews_tour_id_created_at_idx', '(tour_id, created_at DESC)'],
  ['tours', 'tours_category_id_idx', '(category_id)'],
  ['tours', 'tours_destination_id_idx', '(destination_id)'],
  ['tour_images', 'tour_images_tour_id_idx', '(tour_id)'],
  ['newsletter_verifications', 'newsletter_verifications_email_idx', '(email)'],
  ['users', 'users_reset_password_token_idx', '(reset_password_token) WHERE reset_password_token IS NOT NULL'],
  ['posts', 'posts_published_created_at_idx', '(is_published, created_at DESC)'],
];

module.exports = {
  async up(queryInterface) {
    for (const [table, name, definition] of INDEXES) {
      await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" ${definition}`);
    }
  },

  async down(queryInterface) {
    for (const [, name] of INDEXES) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  },
};
