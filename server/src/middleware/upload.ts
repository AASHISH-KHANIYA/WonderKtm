import multer from 'multer';
import { env } from '../config/env.js';

// Memory storage; the real size/type check happens in validateImageUpload (magic bytes), the hard cap here protects memory.
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(env.MAX_UPLOAD_MB, 10) * 1024 * 1024, files: 1 } });
