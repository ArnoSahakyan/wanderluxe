import { z } from 'zod';

export const signUpSchema = z
  .object({
    full_name: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Full name is required' : 'Full name must be a string',
      })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name must be less than 100 characters')
      .refine((val) => /^[a-zA-Z\s.'-]+$/.test(val), {
        message: 'Full name contains invalid characters',
      }),

    email: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Email is required' : 'Email must be a string',
      })
      .trim()
      .email('Invalid email address')
      .max(254, 'Email is too long'),

    password: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Password is required' : 'Password must be a string',
      })
      .trim()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be less than 128 characters')
      .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
      .regex(/[a-z]/, 'Password must include at least one lowercase letter')
      .regex(/[0-9]/, 'Password must include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character'),

    confirm_password: z.string({ error: 'Please confirm your password' }).trim(),

    terms: z.literal(true, {
      error: 'You must accept the terms and conditions',
    }),
  })
  .strict()
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

export type SignUpFormData = z.infer<typeof signUpSchema>;
