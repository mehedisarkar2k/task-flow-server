import { z } from 'zod';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    name: z.string().min(2).max(100).optional(),
    jobTitle: z.string().max(100).optional(),
    department: z.string().max(100).optional(),
    location: z.string().max(100).optional(),
    bio: z.string().max(500).optional(),
    skills: z.array(z.string()).max(20).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
    emailSummaries: z.boolean().optional(),
    mentionAlerts: z.boolean().optional(),
    marketingUpdates: z.boolean().optional(),
  }),
});

export const requestAvatarUploadSchema = z.object({
  body: z.object({
    fileName: z.string(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
    fileSize: z.number().max(819200, 'Max size of 800K'),
  }),
});

export const confirmAvatarUploadSchema = z.object({
  body: z.object({
    fileKey: z.string(),
  }),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>['body'];
export type RequestAvatarUploadBody = z.infer<typeof requestAvatarUploadSchema>['body'];
export type ConfirmAvatarUploadBody = z.infer<typeof confirmAvatarUploadSchema>['body'];
