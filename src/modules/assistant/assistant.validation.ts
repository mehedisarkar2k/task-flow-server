import { z } from 'zod';

export const chatSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(2000),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1).max(8000),
        }),
      )
      .max(20)
      .optional(),
  }),
});

export type ChatBody = z.infer<typeof chatSchema>['body'];
