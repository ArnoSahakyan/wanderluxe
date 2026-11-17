'use strict';

/**
 * The Contact model (contact form + admin inbox) had no table: neither the
 * production dump nor any earlier migration created it. Mirrors the model.
 * Idempotent: does nothing if the table already exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('contacts')) return;

    await queryInterface.createTable('contacts', {
      contact_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      full_name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      phone_number: { type: Sequelize.STRING, allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.ENUM('unread', 'read', 'replied'),
        allowNull: false,
        defaultValue: 'unread',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('contacts', ['status'], { name: 'contacts_status_idx' });
    await queryInterface.addIndex('contacts', ['created_at'], { name: 'contacts_created_at_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contacts');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_contacts_status";');
  },
};
