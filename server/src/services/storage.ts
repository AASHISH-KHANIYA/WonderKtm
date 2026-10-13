import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env, isProd } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
const EXT: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Detects the real image type from magic bytes — never trust the client-supplied mimetype. */
export function detectImageType(buf: Buffer): ImageMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function validateImageUpload(file: { buffer: Buffer; size: number } | undefined, maxMb = env.MAX_UPLOAD_MB): ImageMime {
  if (!file) throw new AppError(400, 'Please choose an image to upload.', 'NO_FILE');
  if (file.size > maxMb * 1024 * 1024) throw new AppError(413, `The file is too large. The limit is ${maxMb} MB.`, 'FILE_TOO_LARGE');
  const mime = detectImageType(file.buffer);
  if (!mime) throw new AppError(415, 'Only JPG, PNG or WebP images are accepted.', 'BAD_FILE_TYPE');
  return mime;
}

export interface StoredFile { key: string; url?: string; provider: 'cloudinary' | 'local' }

const localRoot = (priv: boolean) => path.resolve(process.cwd(), priv ? 'uploads-private' : 'uploads-public');

export function storageStatus() {
  const cloudinaryReady = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  if (env.STORAGE_DRIVER === 'cloudinary') {
    return { driver: 'cloudinary', configured: cloudinaryReady, note: cloudinaryReady ? 'Cloudinary is configured.' : 'Cloudinary credentials are missing. Image uploads are disabled until CLOUDINARY_* variables are set.' };
  }
  return { driver: 'local', configured: true, note: isProd ? 'Local disk storage is not suitable for production. Switch to Cloudinary or another managed object store.' : 'Local development storage is active.' };
}

function ensureReady() {
  const s = storageStatus();
  if (!s.configured) throw new AppError(503, s.note, 'STORAGE_NOT_CONFIGURED');
  if (env.STORAGE_DRIVER === 'cloudinary')
    cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
}

export async function putFile(buf: Buffer, mime: ImageMime, opts: { folder: string; private: boolean }): Promise<StoredFile> {
  ensureReady();
  const id = crypto.randomUUID();
  if (env.STORAGE_DRIVER === 'cloudinary') {
    const publicId = `wonderktm/${opts.folder}/${id}`;
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: 'image', type: opts.private ? 'authenticated' : 'upload', overwrite: false },
        (err) => (err ? reject(new AppError(502, 'The image storage service rejected the upload.', 'STORAGE_ERROR')) : resolve())
      );
      stream.end(buf);
    });
    return { key: publicId, provider: 'cloudinary', url: opts.private ? undefined : cloudinary.url(publicId, { secure: true, fetch_format: 'auto', quality: 'auto' }) };
  }
  const rel = path.join(opts.folder, `${id}.${EXT[mime]}`);
  const full = path.join(localRoot(opts.private), rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf, { mode: 0o600 });
  return { key: rel.split(path.sep).join('/'), provider: 'local', url: opts.private ? undefined : `/uploads/${rel.split(path.sep).join('/')}` };
}

/** Reads a private file for streaming through an authorised API route. Private files never get a public URL. */
export async function readPrivate(key: string, provider: string): Promise<{ data: Buffer; mime: ImageMime }> {
  if (provider === 'cloudinary') {
    ensureReady();
    const url = cloudinary.url(key, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image' });
    const res = await fetch(url);
    if (!res.ok) throw new AppError(502, 'Could not retrieve the file from storage.', 'STORAGE_ERROR');
    const data = Buffer.from(await res.arrayBuffer());
    return { data, mime: detectImageType(data) ?? 'image/jpeg' };
  }
  const full = path.resolve(localRoot(true), key);
  if (!full.startsWith(localRoot(true) + path.sep)) throw new AppError(400, 'Invalid file key.');
  const data = await fs.readFile(full).catch(() => {
    throw new AppError(404, 'File not found.', 'NOT_FOUND');
  });
  return { data, mime: detectImageType(data) ?? 'image/jpeg' };
}

export async function deleteFile(key: string, provider: string, priv = false) {
  try {
    if (provider === 'cloudinary') {
      ensureReady();
      await cloudinary.uploader.destroy(key, { type: priv ? 'authenticated' : 'upload', resource_type: 'image' });
    } else {
      await fs.rm(path.resolve(localRoot(priv), key), { force: true });
    }
  } catch {
    /* best-effort cleanup */
  }
}
