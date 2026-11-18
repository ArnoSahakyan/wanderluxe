'use strict';

/**
 * Cancelled bookings are kept as history instead of being deleted: the row stays
 * with status 'cancelled' plus who cancelled it, when and why.
 * Additive and idempotent: three nullable columns, nothing else changes.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('bookings');
    if (!columns.cancelled_at) {
      await queryInterface.addColumn('bookings', 'cancelled_at', { type: Sequelize.DATE, allowNull: true });
    }
    if (!columns.cancelled_by) {
      await queryInterface.addColumn('bookings', 'cancelled_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }
    if (!columns.cancellation_reason) {
      await queryInterface.addColumn('bookings', 'cancellation_reason', { type: Sequelize.STRING(255), allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'cancellation_reason');
    await queryInterface.removeColumn('bookings', 'cancelled_by');
    await queryInterface.removeColumn('bookings', 'cancelled_at');
  },
};
