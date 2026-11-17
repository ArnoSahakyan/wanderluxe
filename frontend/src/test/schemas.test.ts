import { describe, expect, it } from 'vitest';
import { signUpSchema } from '../shared/schemas/sign-up.schema';
import { signInSchema } from '../shared/schemas/sign-in.schema';
import { reviewSchema } from '../shared/schemas/review.schema';
import { parsePositiveInt } from '../utils/filters';

const validSignUp = {
  full_name: 'Jane Traveller',
  email: 'jane@example.com',
  password: 'Str0ng!Pass',
  confirm_password: 'Str0ng!Pass',
  terms: true as const,
};

describe('signUpSchema (mirrors the server-side password policy)', () => {
  it('accepts a valid registration', () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it.each([
    ['short', 'Sh0rt!'],
    ['no uppercase', 'str0ng!pass'],
    ['no digit', 'Strong!Pass'],
    ['no symbol', 'Str0ngPass1'],
  ])('rejects a password with %s', (_label, password) => {
    const result = signUpSchema.safeParse({ ...validSignUp, password, confirm_password: password });
    expect(result.success).toBe(false);
  });

  it('requires matching confirmation and accepted terms', () => {
    const mismatch = signUpSchema.safeParse({ ...validSignUp, confirm_password: 'Other!Pass1' });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(mismatch.error.issues[0].path).toEqual(['confirm_password']);

    expect(signUpSchema.safeParse({ ...validSignUp, terms: false }).success).toBe(false);
  });

  it('uses the custom "required" message when a field is missing', () => {
    const result = signUpSchema.safeParse({ ...validSignUp, full_name: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('Full name is required');
  });
});

describe('signInSchema', () => {
  it('rejects malformed e-mails', () => {
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('reviewSchema', () => {
  it('requires a rating between 1 and 5', () => {
    expect(
      reviewSchema.safeParse({ rating: 0, comment: 'Lovely tour, would book again.' }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({ rating: 6, comment: 'Lovely tour, would book again.' }).success,
    ).toBe(false);
  });
});

describe('parsePositiveInt', () => {
  it('falls back for missing, non-numeric, zero or fractional values', () => {
    expect(parsePositiveInt(null, 1)).toBe(1);
    expect(parsePositiveInt('abc', 1)).toBe(1);
    expect(parsePositiveInt('0', 1)).toBe(1);
    expect(parsePositiveInt('2.5', 1)).toBe(1);
    expect(parsePositiveInt('3', 1)).toBe(3);
  });
});
