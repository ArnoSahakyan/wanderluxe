'use strict';

/** Lets the API reject refresh tokens issued before the last password change. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('users');
    if (!columns.password_changed_at) {
      await queryInterface.addColumn('users', 'password_changed_at', { type: Sequelize.DATE, allowNull: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'password_changed_at');
  },
};
