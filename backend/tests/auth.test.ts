import { describe, expect, it } from 'vitest';
import { RefreshToken, User } from '../src/db/models';
import { ROTATION_GRACE_MS } from '../src/lib/sessions';
import { hashToken } from '../src/utils/security';
import { sentEmails } from '../src/utils/sendEmail';
import { STRONG_PASSWORD, api, createUser, sessionCookie, signInSession, uniqueEmail } from './helpers';

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
    it('returns an access token and a safe user; the refresh token only in an httpOnly cookie', async () => {
        const { user } = await createUser();
        const res = await api()
            .post('/api/auth/signin')
            .send({ email: user.email.toUpperCase(), password: STRONG_PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body).not.toHaveProperty('refreshToken');
        expect(res.body.user).toMatchObject({
            user_id: user.user_id,
            email: user.email,
            role: 'customer',
        });
        expect(JSON.stringify(res.body)).not.toContain('$2');

        const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('wl_session='))!;
        expect(raw).toMatch(/HttpOnly/i);
        expect(raw).toMatch(/SameSite=Strict/i);
        expect(raw).toMatch(/Path=\/api\/auth/);
        expect(raw).toMatch(/Max-Age=\d+/);

        // Only a hash is stored.
        const value = sessionCookie(res)!.split('=')[1];
        expect(await RefreshToken.count({ where: { token_hash: value } })).toBe(0);
        expect(await RefreshToken.count({ where: { token_hash: hashToken(value) } })).toBe(1);
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
});

describe('sessions (POST /auth/refresh, /auth/logout)', () => {
    const refresh = (cookie?: string) => {
        const req = api().post('/api/auth/refresh');
        return cookie ? req.set('Cookie', cookie) : req;
    };

    it('refresh rotates the cookie and returns a new access token with the profile', async () => {
        const { user } = await createUser();
        const first = await signInSession(user.email);

        const res = await refresh(first);
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body.user).toMatchObject({
            user_id: user.user_id,
            role: 'customer',
        });
        const second = sessionCookie(res);
        expect(second).toBeDefined();
        expect(second).not.toBe(first);

        const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
        expect(me.status).toBe(200);

        // The new cookie keeps working.
        expect((await refresh(second)).status).toBe(200);
    });

    it('answers 401 without a cookie or with an unknown one, and clears it', async () => {
        expect((await refresh()).status).toBe(401);
        const bad = await refresh('wl_session=garbage');
        expect(bad.status).toBe(401);
        expect(String(bad.headers['set-cookie'])).toMatch(/wl_session=;/);
    });

    it('does not accept an access token or a body token', async () => {
        const { token } = await createUser();
        expect((await refresh(`wl_session=${token}`)).status).toBe(401);
        expect((await api().post('/api/auth/refresh').send({ refreshToken: token })).status).toBe(401);
    });

    it('two tabs refreshing at once both succeed (grace period, one rotation)', async () => {
        const { user } = await createUser();
        const cookie = await signInSession(user.email);
        const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect([sessionCookie(a), sessionCookie(b)].filter(Boolean)).toHaveLength(1);
    });

    it('reusing a rotated token after the grace period revokes the whole session', async () => {
        const { user } = await createUser();
        const stolen = await signInSession(user.email);
        const current = sessionCookie(await refresh(stolen))!;

        await RefreshToken.update(
            { rotated_at: new Date(Date.now() - ROTATION_GRACE_MS - 1000) },
            { where: { token_hash: hashToken(stolen.split('=')[1]) } },
        );
        expect((await refresh(stolen)).status).toBe(401);
        // The legitimate browser is signed out too: the session is no longer trusted.
        expect((await refresh(current)).status).toBe(401);
    });

    it('logout ends only this session and clears the cookie', async () => {
        const { user } = await createUser();
        const laptop = await signInSession(user.email);
        const phone = await signInSession(user.email);

        const out = await api().post('/api/auth/logout').set('Cookie', laptop);
        expect(out.status).toBe(204);
        expect(String(out.headers['set-cookie'])).toMatch(/wl_session=;.*Path=\/api\/auth/);

        expect((await refresh(laptop)).status).toBe(401);
        expect((await refresh(phone)).status).toBe(200);

        // Logging out without a session is harmless.
        expect((await api().post('/api/auth/logout')).status).toBe(204);
    });

    it('changing the password signs out other devices but keeps this one', async () => {
        const { user, auth } = await createUser();
        const other = await signInSession(user.email);

        const res = await api().put('/api/account/password').set(auth).send({
            current_password: STRONG_PASSWORD,
            new_password: 'An0ther!Pass',
        });
        expect(res.status).toBe(200);
        const here = sessionCookie(res);
        expect(here).toBeDefined();

        expect((await refresh(other)).status).toBe(401);
        expect((await refresh(here)).status).toBe(200);
    });

    it('a deleted account can no longer refresh', async () => {
        const admin = await createUser('admin');
        const { user } = await createUser();
        const cookie = await signInSession(user.email);
        await api().delete(`/api/account/${user.user_id}`).set(admin.auth).expect(200);
        expect((await refresh(cookie)).status).toBe(401);
    });
});

describe('password reset', () => {
    it('does not reveal whether an e-mail is registered', async () => {
        const res = await api().post('/api/auth/request-password-reset').send({ email: uniqueEmail('nobody') });
        expect(res.status).toBe(200);
    });

    it('stores only a hash, resets once, and signs the user out everywhere', async () => {
        const { user } = await createUser();
        const session = await signInSession(user.email);

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
        expect((await api().post('/api/auth/refresh').set('Cookie', session)).status).toBe(401);
    });
});
