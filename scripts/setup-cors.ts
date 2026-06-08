import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { env } from '../src/config/env';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: env.S3_END_POINT,
  credentials: {
    accessKeyId: env.ACCESS_KEY_ID,
    secretAccessKey: env.SECRET_ACCESS_KEY,
  },
});

async function setCors() {
  const command = new PutBucketCorsCommand({
    Bucket: env.BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['http://localhost:3000', 'https://localhost:3000'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  try {
    await s3Client.send(command);
    console.log(`Successfully configured CORS for bucket: ${env.BUCKET_NAME}`);
  } catch (error) {
    console.error('Error configuring CORS:', error);
  }
}

setCors();
