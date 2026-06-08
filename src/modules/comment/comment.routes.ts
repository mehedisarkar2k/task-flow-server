import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listCommentsSchema,
  createCommentSchema,
  updateCommentSchema,
  commentIdParamsSchema,
} from './comment.validation';
import {
  listComments,
  createComment,
  updateComment,
  getCommentVersions,
  deleteComment,
} from './comment.controller';

// ─── /api/tasks/:taskId/comments ─────────────────────────────────────────────
// mergeParams so the nested router can read :taskId from the mount path.
const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', validate(listCommentsSchema), listComments);
router.post('/', validate(createCommentSchema), createComment);
router.put('/:commentId', validate(updateCommentSchema), updateComment);
router.get('/:commentId/versions', validate(commentIdParamsSchema), getCommentVersions);
router.delete('/:commentId', validate(commentIdParamsSchema), deleteComment);

export const commentRoutes = router;
