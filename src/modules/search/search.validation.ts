import { z } from 'zod';

export const globalSearchSchema = z.object({
  query: z.object({
    q: z.string().trim().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  }),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>['query'];
