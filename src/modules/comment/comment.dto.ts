import type { Prisma } from '../../../generated/prisma';

export const commentInclude = {
  user: { select: { id: true, name: true, role: true, image: true } },
} satisfies Prisma.CommentInclude;

type CommentPayload = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

export const toComment = (c: CommentPayload) => ({
  id: c.id,
  body: c.body,
  isEdited: c.isEdited,
  user: { id: c.user.id, name: c.user.name, role: c.user.role, image: c.user.image },
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});
