'use strict';

/**
 * Audit trail of booking status changes: one row per change (created, confirmed,
 * cancelled, completed, ...), written in the same transaction as the change.
 * Additive and idempotent: creates one new table, touches nothing else.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('booking_status_history')) return;

    await queryInterface.createTable('booking_status_history', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      booking_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'bookings', key: 'booking_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      /** NULL for the row written when the booking is created. */
      from_status: { type: Sequelize.STRING(20), allowNull: true },
      to_status: { type: Sequelize.STRING(20), allowNull: false },
      /** NULL when the system made the change (e.g. a finished tour marks bookings completed). */
      changed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      note: { type: Sequelize.STRING(255), allowNull: true },
      changed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('booking_status_history', ['booking_id', 'changed_at'], {
      name: 'booking_status_history_booking_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_status_history');
  },
};
