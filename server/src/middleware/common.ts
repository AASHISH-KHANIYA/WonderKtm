import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors.js';
import { isProd, isTest } from '../config/env.js';

export const limiter = (windowMin: number, max: number) =>
  rateLimit({ windowMs: windowMin * 60_000, limit: isTest ? 10_000 : max, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } } });

/** Parses and replaces req.body / query with the validated, stripped value. */
export const validate =
  (schema: ZodTypeAny, part: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[part]);
    if (!r.success) return next(r.error);
    (req as any)[part] = r.data;
    next();
  };

/** Rejects any key starting with `$` or containing `.` in user-supplied objects (NoSQL operator injection). */
export function sanitizeMongo(req: Request, _res: Response, next: NextFunction) {
  const bad = (o: unknown, depth = 0): boolean => {
    if (depth > 8 || o == null || typeof o !== 'object') return false;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) return true;
      if (bad(v, depth + 1)) return true;
    }
    return false;
  };
  if (bad(req.body) || bad(req.query) || bad(req.params)) return next(new AppError(400, 'Invalid characters in request.', 'BAD_REQUEST'));
  next();
}

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => next(new AppError(404, 'Route not found.', 'NOT_FOUND'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Please check the highlighted fields.', fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err?.code === 11000) return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That value is already in use.' } });
  if (err?.name === 'MulterError') return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: err.code, message: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : 'Upload failed.' } });
  if (err?.name === 'CastError') return res.status(400).json({ error: { code: 'BAD_ID', message: 'Invalid identifier.' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Invalid JSON body.' } });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: isProd ? 'Something went wrong. Please try again.' : String(err?.message ?? err) } });
};
