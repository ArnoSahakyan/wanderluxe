'use strict';

/**
 * Server-side sign-in sessions. The browser holds an opaque refresh token in an
 * httpOnly cookie; only its SHA-256 hash is stored here. Every refresh rotates
 * the token (old row marked rotated, new row inserted with the same session_id),
 * so logout, password changes and token theft can end a session for real.
 * Additive and idempotent: creates one new table, touches nothing else.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('refresh_tokens')) return;

    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      /** One sign-in; shared by every rotated token that descends from it. */
      session_id: { type: Sequelize.UUID, allowNull: false },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      /** Set when this token was exchanged for a newer one. */
      rotated_at: { type: Sequelize.DATE, allowNull: true },
      /** Set on logout, password change/reset, or detected token reuse. */
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('refresh_tokens', ['user_id'], { name: 'refresh_tokens_user_id_idx' });
    await queryInterface.addIndex('refresh_tokens', ['session_id'], { name: 'refresh_tokens_session_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
