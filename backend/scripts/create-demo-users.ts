/**
 * Creates (or repairs) the two demo accounts behind "Try as customer / admin":
 *
 *   DEMO_CUSTOMER_EMAIL  (default demo-customer@example.com)  role customer
 *   DEMO_ADMIN_EMAIL     (default demo-admin@example.com)     role admin
 *
 * Each gets a long random password that is never printed, so nobody can sign in
 * with a password; the only way in is POST /api/auth/demo while DEMO_MODE=true.
 * What demo sessions may do is limited in src/lib/demo.ts.
 *
 * Uses the database from backend/.env (or DATABASE_URL etc. in the environment).
 * Safe to re-run. Touches only these two accounts.
 *
 *   npm run db:demo-users
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env';
import { Role, User, sequelize } from '../src/db/models';
import { type DemoRole, demoEmail } from '../src/utils/demoAccounts';

const accounts: { role: DemoRole; full_name: string }[] = [
    { role: 'customer', full_name: 'Demo Traveller' },
    { role: 'admin', full_name: 'Demo Admin' },
];

const main = async () => {
    const host = config.db.url ? new URL(config.db.url).hostname : config.db.host;
    console.log(`Database host: ${host}`);

    for (const account of accounts) {
        const email = demoEmail(account.role);
        const role = await Role.findOne({ where: { name: account.role } });
        if (!role) throw new Error(`Role "${account.role}" not found — import the database first.`);

        // Random and discarded: the account can't be used with a password.
        const password = await bcrypt.hash(randomBytes(32).toString('base64url'), config.bcryptRounds);
        const [user, created] = await User.findOrCreate({
            where: { email },
            defaults: { email, full_name: account.full_name, password, role_id: role.role_id },
            paranoid: false,
        });
        if (!created) {
            await user.restore();
            await user.update({ full_name: account.full_name, password, role_id: role.role_id });
        }
        console.log(`${created ? 'created' : 'updated'} ${email} (${account.role})`);
    }
    console.log('\nEnable the sign-in buttons with DEMO_MODE=true on the API.');
    await sequelize.close();
};

main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await sequelize.close();
    process.exit(1);
});
