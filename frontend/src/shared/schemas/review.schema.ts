import { z } from 'zod';

export const reviewSchema = z
  .object({
    rating: z
      .number({
        error: (issue) =>
          issue.input === undefined ? 'Rating is required' : 'Rating must be a number',
      })
      .int('Rating must be an integer')
      .min(1, 'Minimum rating is 1')
      .max(5, 'Maximum rating is 5'),

    comment: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Review text is required' : 'Review must be a string',
      })
      .trim()
      .min(5, 'Review must be at least 5 characters')
      .max(255, 'Review must be less than 255 characters')
      .refine((text) => !/http[s]?:\/\//i.test(text), {
        message: 'Links are not allowed in reviews',
      }),
  })
  .strict();

export type ReviewFormData = z.infer<typeof reviewSchema>;
