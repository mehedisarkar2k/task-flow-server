import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: env.S3_END_POINT,
  credentials: {
    accessKeyId: env.ACCESS_KEY_ID,
    secretAccessKey: env.SECRET_ACCESS_KEY,
  },
});

export const UploadService = {
  /**
   * Generates a pre-signed URL for a client to upload a file directly to R2.
   * @param key The object key (path) in the bucket.
   * @param contentType The MIME type of the file.
   * @param expiresIn Time in seconds until the link expires.
   */
  async generatePresignedUrl(key: string, contentType: string, expiresIn = 3600) {
    const command = new PutObjectCommand({
      Bucket: env.BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return { url, key };
  },

  /**
   * Copies a file within the bucket (e.g., from temp/ to its final location).
   * @param sourceKey The current key of the object.
   * @param destKey The new key of the object.
   */
  async copyAndMakePermanent(sourceKey: string, destKey: string) {
    const copyCommand = new CopyObjectCommand({
      Bucket: env.BUCKET_NAME,
      CopySource: `${env.BUCKET_NAME}/${sourceKey}`,
      Key: destKey,
    });

    await s3Client.send(copyCommand);

    // Optionally delete the source file after copy
    await this.deleteFile(sourceKey);

    return destKey;
  },

  /**
   * Deletes a file from the bucket.
   * @param key The object key.
   */
  async deleteFile(key: string) {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: env.BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(deleteCommand);
  },
};
