import bcrypt from 'bcryptjs';
import request from 'supertest';
import sharp from 'sharp';
import app from '../src/app';
import { Role, User } from '../src/db/models';
import { generateToken } from '../src/utils/generateTokens';

export const api = () => request(app);

export const STRONG_PASSWORD = 'Str0ng!Passw0rd';

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++counter}@example.test`;

/** Creates a user directly in the DB and returns a bearer token for it. */
export const createUser = async (role: 'admin' | 'customer' = 'customer') => {
    const roleRow = await Role.findOne({ where: { name: role } });
    const user = await User.create({
        full_name: `Test ${role}`,
        email: uniqueEmail(role),
        password: bcrypt.hashSync(STRONG_PASSWORD, 4),
        role_id: roleRow!.role_id,
    });
    await user.reload({ include: [{ model: Role, as: 'Role' }] });
    return {
        user,
        token: generateToken(user),
        auth: { Authorization: `Bearer ${generateToken(user)}` },
    };
};

export const pngBuffer = () =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 20, g: 120, b: 120 } } })
        .png()
        .toBuffer();

/** Admin-created tour starting `daysAhead` days from now. */
export const createTour = async (adminAuth: Record<string, string>, opts: { daysAhead?: number; spots?: number } = {}) => {
    const start = new Date(Date.now() + (opts.daysAhead ?? 30) * 86_400_000);
    const end = new Date(start.getTime() + 5 * 86_400_000);
    const res = await api()
        .post('/api/tours')
        .set(adminAuth)
        .field('name', `Test tour ${++counter}`)
        .field('description', 'A tour created by the test-suite')
        .field('price', '100.10')
        .field('available_spots', String(opts.spots ?? 5))
        .field('start_date', start.toISOString())
        .field('end_date', end.toISOString())
        .field('category_id', '1')
        .field('destination_id', '1')
        .attach('images', await pngBuffer(), { filename: 'cover.png', contentType: 'image/png' });
    if (res.status !== 201) throw new Error(`createTour failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { tour_id: number; available_spots: number };
};

/** The `wl_session=<value>` pair from a response's Set-Cookie header, if any. */
export const sessionCookie = (res: { headers: Record<string, unknown> }): string | undefined => {
    const header = res.headers['set-cookie'];
    const cookies = Array.isArray(header) ? (header as string[]) : [];
    const pair = cookies.find((c) => c.startsWith('wl_session='))?.split(';')[0];
    return pair && pair !== 'wl_session=' ? pair : undefined;
};

/** Signs in through the API and returns the session cookie the browser would keep. */
export const signInSession = async (email: string, password = STRONG_PASSWORD) => {
    const res = await api().post('/api/auth/signin').send({ email, password });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
    return sessionCookie(res)!;
};
