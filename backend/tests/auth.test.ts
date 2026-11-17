import { describe, expect, it } from 'vitest';
import { User } from '../src/db/models';
import { sentEmails } from '../src/utils/sendEmail';
import { STRONG_PASSWORD, api, createUser, uniqueEmail } from './helpers';

const signUp = (body: Record<string, unknown>) => api().post('/api/auth/signup').send(body);

describe('POST /api/auth/signup', () => {
    it('registers a customer (and accepts the extra SPA fields)', async () => {
        const email = uniqueEmail('signup');
        const res = await signUp({
            full_name: 'Jane Traveller',
            email,
            password: STRONG_PASSWORD,
            confirm_password: STRONG_PASSWORD,
            terms: true,
        });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ message: 'Registration successful.' });

        const user = await User.findOne({ where: { email } });
        expect(user?.role_id).toBe(2);
        expect(user?.password).not.toBe(STRONG_PASSWORD);
    });

    it('rejects weak passwords and missing fields with 400', async () => {
        const weak = await signUp({ full_name: 'A', email: uniqueEmail(), password: 'password' });
        expect(weak.status).toBe(400);
        expect(weak.body.errors.length).toBeGreaterThan(0);

        const missing = await signUp({ email: uniqueEmail() });
        expect(missing.status).toBe(400);
    });

    it('treats e-mails case-insensitively for duplicates (409)', async () => {
        const email = uniqueEmail('dup');
        await signUp({ full_name: 'First', email, password: STRONG_PASSWORD }).expect(201);
        const res = await signUp({ full_name: 'Second', email: email.toUpperCase(), password: STRONG_PASSWORD });
        expect(res.status).toBe(409);
    });
});

describe('POST /api/auth/signin', () => {
    it('returns tokens and a safe user object', async () => {
        const { user } = await createUser();
        const res = await api().post('/api/auth/signin').send({ email: user.email.toUpperCase(), password: STRONG_PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body.refreshToken).toEqual(expect.any(String));
        expect(res.body.user).toMatchObject({ user_id: user.user_id, email: user.email, role: 'customer' });
        expect(JSON.stringify(res.body)).not.toContain('$2');
    });

    it('answers 401 with the same message for unknown user and wrong password', async () => {
        const { user } = await createUser();
        const wrong = await api().post('/api/auth/signin').send({ email: user.email, password: 'Wrong!Pass1' });
        const unknown = await api().post('/api/auth/signin').send({ email: uniqueEmail('ghost'), password: 'Wrong!Pass1' });
        expect(wrong.status).toBe(401);
        expect(unknown.status).toBe(401);
        expect(wrong.body).toEqual(unknown.body);
    });
});

describe('tokens', () => {
    it('GET /auth/me requires a valid token', async () => {
        const { auth, user } = await createUser();
        expect((await api().get('/api/auth/me')).status).toBe(401);
        expect((await api().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
        const me = await api().get('/api/auth/me').set(auth);
        expect(me.status).toBe(200);
        expect(me.body.user).toMatchObject({ user_id: user.user_id, role: 'customer' });
    });

    it('refresh: valid token → new access token, garbage → 401 (was 500)', async () => {
        const { refreshToken } = await createUser();
        const ok = await api().post('/api/auth/refresh').send({ refreshToken });
        expect(ok.status).toBe(200);
        expect(ok.body.token).toEqual(expect.any(String));

        const bad = await api().post('/api/auth/refresh').send({ refreshToken: 'garbage' });
        expect(bad.status).toBe(401);
    });

    it('an access token cannot be used as a refresh token', async () => {
        const { token } = await createUser();
        expect((await api().post('/api/auth/refresh').send({ refreshToken: token })).status).toBe(401);
    });
});

describe('password reset', () => {
    it('does not reveal whether an e-mail is registered', async () => {
        const res = await api().post('/api/auth/request-password-reset').send({ email: uniqueEmail('nobody') });
        expect(res.status).toBe(200);
    });

    it('stores only a hash, resets once, and revokes older refresh tokens', async () => {
        const { user, refreshToken } = await createUser();
        // ensure the new password timestamp is in a later second than the token's iat
        await new Promise((r) => setTimeout(r, 1100));

        await api().post('/api/auth/request-password-reset').send({ email: user.email }).expect(200);
        const mail = sentEmails.findLast((m) => m.to === user.email);
        const token = /token=([\w-]+)/.exec(mail!.html)![1];

        await user.reload();
        expect(user.reset_password_token).toBeTruthy();
        expect(user.reset_password_token).not.toBe(token);

        const weak = await api().post(`/api/auth/reset-password?token=${token}`).send({ new_password: 'short' });
        expect(weak.status).toBe(400);

        const newPassword = 'N3w!Password';
        const reset = await api().post(`/api/auth/reset-password?token=${token}`).send({ new_password: newPassword });
        expect(reset.status).toBe(200);

        const reuse = await api().post(`/api/auth/reset-password?token=${token}`).send({ new_password: newPassword });
        expect(reuse.status).toBe(400);

        await api().post('/api/auth/signin').send({ email: user.email, password: newPassword }).expect(200);
        expect((await api().post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
    });
});
