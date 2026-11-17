import { describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, api, createUser, uniqueEmail } from './helpers';

describe('PUT /api/account/info', () => {
    it('never returns the password hash or reset data (S-01) and keeps the role', async () => {
        const { auth } = await createUser();
        const res = await api()
            .put('/api/account/info')
            .set(auth)
            .send({ full_name: 'Renamed User', email: uniqueEmail('renamed'), phone_number: '+374 10 000000' });
        expect(res.status).toBe(200);
        expect(res.body.user).not.toHaveProperty('password');
        expect(res.body.user).not.toHaveProperty('reset_password_token');
        expect(res.body.user).toMatchObject({ full_name: 'Renamed User', phone_number: '+374 10 000000', role: 'customer' });
    });

    it('rejects an e-mail that belongs to someone else with 409', async () => {
        const other = await createUser();
        const { auth } = await createUser();
        const res = await api()
            .put('/api/account/info')
            .set(auth)
            .send({ full_name: 'Somebody', email: other.user.email.toUpperCase() });
        expect(res.status).toBe(409);
    });
});

describe('PUT /api/account/password', () => {
    it('requires the current password', async () => {
        const { auth } = await createUser();
        const wrong = await api()
            .put('/api/account/password')
            .set(auth)
            .send({ current_password: 'nope', new_password: 'An0ther!Pass' });
        expect(wrong.status).toBe(400);

        const ok = await api()
            .put('/api/account/password')
            .set(auth)
            .send({ current_password: STRONG_PASSWORD, new_password: 'An0ther!Pass' });
        expect(ok.status).toBe(200);
    });
});

describe('admin user management', () => {
    it('customers get 403, guests 401, admins 200 without password hashes', async () => {
        const customer = await createUser();
        const admin = await createUser('admin');
        expect((await api().get('/api/account')).status).toBe(401);
        expect((await api().get('/api/account').set(customer.auth)).status).toBe(403);
        const res = await api().get('/api/account?limit=5').set(admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.users.length).toBeLessThanOrEqual(5);
        expect(JSON.stringify(res.body)).not.toContain('"password"');
    });

    it('caps page size at 100', async () => {
        const admin = await createUser('admin');
        expect((await api().get('/api/account?limit=1000').set(admin.auth)).status).toBe(400);
    });

    it('prevents admins from deleting or demoting themselves', async () => {
        const admin = await createUser('admin');
        const del = await api().delete(`/api/account/${admin.user.user_id}`).set(admin.auth);
        expect(del.status).toBe(400);
        const demote = await api().patch(`/api/account/${admin.user.user_id}/role`).set(admin.auth).send({ role_id: 2 });
        expect(demote.status).toBe(400);
    });

    it('role change response has no password hash', async () => {
        const admin = await createUser('admin');
        const target = await createUser();
        const res = await api().patch(`/api/account/${target.user.user_id}/role`).set(admin.auth).send({ role_id: 1 });
        expect(res.status).toBe(200);
        expect(res.body.user).not.toHaveProperty('password');
    });
});
