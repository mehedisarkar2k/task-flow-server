import { Response } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { prisma } from '../../config/prisma';
import { UploadService } from '../../shared/upload.service';
import crypto from 'node:crypto';
import type {
  UpdateProfileBody,
  RequestAvatarUploadBody,
  ConfirmAvatarUploadBody,
} from './profile.validation';

export const updateProfile = catchAsync<UpdateProfileBody>(
  async (req, res: Response) => {
    const userId = req.user!.id;
    const { firstName, lastName, ...rest } = req.body;

    // Build a final `name` value whenever either name part changes
    let name: string | undefined;
    if (firstName !== undefined || lastName !== undefined) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const finalFirst = firstName !== undefined ? firstName : (user?.firstName ?? '');
      const finalLast  = lastName  !== undefined ? lastName  : (user?.lastName  ?? '');
      name = `${finalFirst} ${finalLast}`.trim();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName  !== undefined ? { lastName }  : {}),
        ...(name      !== undefined ? { name }       : {}),
      },
    });

    res.status(200).json({ success: true, data: updatedUser });
  },
);

export const requestAvatarUpload = catchAsync<RequestAvatarUploadBody>(
  async (req, res: Response) => {
    const userId = req.user!.id;
    const { fileName, mimeType } = req.body;

    const ext = fileName.split('.').pop() ?? 'png';
    const randomId = crypto.randomUUID();
    const tempKey = `temp/avatars/${userId}-${randomId}.${ext}`;

    const { url, key } = await UploadService.generatePresignedUrl(tempKey, mimeType, 3600);

    res.status(200).json({
      success: true,
      data: {
        uploadUrl: url,
        fileKey: key,
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
      },
    });
  },
);

export const confirmAvatarUpload = catchAsync<ConfirmAvatarUploadBody>(
  async (req, res: Response) => {
    const userId = req.user!.id;
    const { fileKey } = req.body;

    const ext = fileKey.split('.').pop() ?? 'png';
    const finalKey = `avatars/${userId}.${ext}`;

    const imageKey = await UploadService.copyAndMakePermanent(fileKey, finalKey);

    await prisma.user.update({
      where: { id: userId },
      data: { image: imageKey },
    });

    res.status(200).json({ success: true, data: { image: imageKey } });
  },
);

export const removeAvatar = catchAsync(async (req, res: Response) => {
  const userId = req.user!.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.image?.startsWith('avatars/')) {
    await UploadService.deleteFile(user.image);
  }

  await prisma.user.update({ where: { id: userId }, data: { image: null } });

  res.status(200).json({ success: true, message: 'Avatar removed.' });
});
