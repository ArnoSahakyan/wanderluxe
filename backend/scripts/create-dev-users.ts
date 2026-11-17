/**
 * Creates (or resets) two LOCAL development accounts so you can sign in without
 * knowing the passwords of the users contained in the production dump:
 *
 *   admin@wanderluxe.local     role admin
 *   customer@wanderluxe.local  role customer
 *
 * Passwords come from DEV_ADMIN_PASSWORD / DEV_CUSTOMER_PASSWORD (backend/.env)
 * or default to the documented development values below.
 * Refuses to run when NODE_ENV=production or against a non-local database host.
 *
 *   npm run db:dev-users
 */
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env';
import { Role, User, sequelize } from '../src/db/models';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db']);

const accounts = [
    {
        email: 'admin@wanderluxe.local',
        full_name: 'Local Admin',
        role: 'admin',
        password: process.env.DEV_ADMIN_PASSWORD ?? 'DevAdmin#2026',
    },
    {
        email: 'customer@wanderluxe.local',
        full_name: 'Local Customer',
        role: 'customer',
        password: process.env.DEV_CUSTOMER_PASSWORD ?? 'DevCustomer#2026',
    },
];

const main = async () => {
    const host = config.db.url ? new URL(config.db.url).hostname : config.db.host;
    if (config.isProduction || !LOCAL_HOSTS.has(host)) {
        console.error(`Refusing to create development users (NODE_ENV=${config.env}, DB host=${host}).`);
        process.exit(1);
    }

    for (const account of accounts) {
        const role = await Role.findOne({ where: { name: account.role } });
        if (!role) throw new Error(`Role "${account.role}" not found — import the database first.`);

        const password = await bcrypt.hash(account.password, config.bcryptRounds);
        const [user, created] = await User.findOrCreate({
            where: { email: account.email },
            defaults: { email: account.email, full_name: account.full_name, password, role_id: role.role_id },
            paranoid: false,
        });
        if (!created) {
            await user.restore();
            await user.update({ password, role_id: role.role_id, password_changed_at: new Date() });
        }
        console.log(`${created ? 'created' : 'reset  '} ${account.email} (${account.role})`);
    }
    console.log('\nPasswords: see DEV_ADMIN_PASSWORD / DEV_CUSTOMER_PASSWORD in backend/.env.example (or your overrides).');
    await sequelize.close();
};

main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await sequelize.close();
    process.exit(1);
});
