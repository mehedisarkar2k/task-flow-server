import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { updateProfileSchema, requestAvatarUploadSchema, confirmAvatarUploadSchema } from './profile.validation';
import { updateProfile, requestAvatarUpload, confirmAvatarUpload, removeAvatar } from './profile.controller';

const router = Router();

router.use(requireAuth);

router.put('/', validate(updateProfileSchema), updateProfile);

router.post('/avatar', validate(requestAvatarUploadSchema), requestAvatarUpload);
router.put('/avatar/confirm', validate(confirmAvatarUploadSchema), confirmAvatarUpload);
router.delete('/avatar', removeAvatar);

export const profileRoutes = router;
