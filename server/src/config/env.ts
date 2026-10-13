import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/wonderktm'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  STORAGE_DRIVER: z.enum(['cloudinary', 'mongo', 'local']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Wonderktm <no-reply@example.com>'),
  ADMIN_NOTIFY_EMAIL: z.string().optional().default(''),
  OWNER_EMAIL: z.string().optional().default(''),
  OWNER_PASSWORD: z.string().optional().default(''),
  OWNER_NAME: z.string().optional().default('Owner'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
