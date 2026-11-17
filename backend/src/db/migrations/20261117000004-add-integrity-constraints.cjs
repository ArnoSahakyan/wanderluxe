'use strict';

/**
 * Integrity rules the application already assumes but the database did not
 * enforce. Before adding each rule the migration COUNTS violating rows; if any
 * exist it stops with an explanation. It never edits or deletes data.
 */
const RULES = [
  {
    name: 'favorites_user_id_tour_id_key',
    check: 'SELECT count(*) AS n FROM (SELECT 1 FROM favorites GROUP BY user_id, tour_id HAVING count(*) > 1) d',
    add: 'CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_id_tour_id_key ON favorites (user_id, tour_id)',
    drop: 'DROP INDEX IF EXISTS favorites_user_id_tour_id_key',
    why: 'duplicate favourites for the same user and tour',
  },
  {
    name: 'reviews_user_id_tour_id_key',
    check: 'SELECT count(*) AS n FROM (SELECT 1 FROM reviews GROUP BY user_id, tour_id HAVING count(*) > 1) d',
    add: 'CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_id_tour_id_key ON reviews (user_id, tour_id)',
    drop: 'DROP INDEX IF EXISTS reviews_user_id_tour_id_key',
    why: 'more than one review by the same user for a tour',
  },
  {
    name: 'tour_images_one_cover_per_tour',
    check: 'SELECT count(*) AS n FROM (SELECT 1 FROM tour_images WHERE is_cover GROUP BY tour_id HAVING count(*) > 1) d',
    add: 'CREATE UNIQUE INDEX IF NOT EXISTS tour_images_one_cover_per_tour ON tour_images (tour_id) WHERE is_cover',
    drop: 'DROP INDEX IF EXISTS tour_images_one_cover_per_tour',
    why: 'tours with more than one cover image',
  },
  {
    name: 'users_email_lower_key',
    check: 'SELECT count(*) AS n FROM (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) d',
    add: 'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))',
    drop: 'DROP INDEX IF EXISTS users_email_lower_key',
    why: 'e-mail addresses that differ only in letter case',
  },
  ...[
    ['reviews', 'reviews_rating_range_check', 'rating BETWEEN 1 AND 5'],
    ['bookings', 'bookings_number_of_people_positive_check', 'number_of_people > 0'],
    ['bookings', 'bookings_total_price_non_negative_check', 'total_price >= 0'],
    ['tours', 'tours_price_non_negative_check', 'price >= 0'],
    ['tours', 'tours_available_spots_non_negative_check', 'available_spots >= 0'],
    ['tours', 'tours_dates_order_check', 'end_date >= start_date'],
  ].map(([table, name, expr]) => ({
    name,
    check: `SELECT count(*) AS n FROM "${table}" WHERE NOT (${expr})`,
    add: `DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
              ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expr});
            END IF;
          END $$;`,
    drop: `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
    why: `rows in ${table} where NOT (${expr})`,
  })),
];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const problems = [];
    for (const rule of RULES) {
      const [[{ n }]] = await q.query(rule.check);
      if (Number(n) > 0) problems.push(`  • ${rule.name}: ${n} group(s)/row(s) — ${rule.why}`);
    }
    if (problems.length) {
      throw new Error(
        'Data must be cleaned up before these constraints can be added (nothing was changed):\n' +
          problems.join('\n') +
          '\nSee DATABASE_AUDIT.md §6.',
      );
    }
    for (const rule of RULES) await q.query(rule.add);
  },

  async down(queryInterface) {
    for (const rule of [...RULES].reverse()) await queryInterface.sequelize.query(rule.drop);
  },
};
