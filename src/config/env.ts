import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),

  // Server
  PORT: z.string().default('8080'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Cloudflare R2 / S3
  TOKEN_VALUE: z.string().optional(), // Provided by user but maybe not needed by S3 client directly if using access key
  ACCESS_KEY_ID: z.string().min(1),
  SECRET_ACCESS_KEY: z.string().min(1),
  S3_END_POINT: z.string().url(),
  CF_PUBLIC_URL: z.string().url(),
  BUCKET_NAME: z.string().min(1),

  // Azure OpenAI (assistant / chatbot)
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_API_VERSION: z.string().min(1).default('2025-04-01-preview'),
  AZURE_OPENAI_MODEL: z.string().min(1), // deployment used for the assistant
  AZURE_OPENAI_MINI_MODEL: z.string().min(1).optional(),
  AZURE_OPENAI_NANO_MODEL: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
