import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';
import { User, type Role, STAFF_ROLES } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { _id: any; email: string; role: Role; firstName: string; tokenVersion: number };
    }
  }
}

export const COOKIE = 'wk_session';
const maxAgeMs = 12 * 60 * 60 * 1000;

export function setSession(res: Response, user: { _id: any; tokenVersion: number }) {
  const token = jwt.sign({ sub: String(user._id), tv: user.tokenVersion }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
  res.cookie(COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: maxAgeMs, path: '/', domain: env.COOKIE_DOMAIN || undefined });
}
export const clearSession = (res: Response) => res.clearCookie(COOKIE, { path: '/', domain: env.COOKIE_DOMAIN || undefined });

/** Attaches req.user if a valid session exists. Never trusts role from the token — always reloaded from the database. */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as { sub: string; tv: number; exp: number; iat: number };
    const u = await User.findById(p.sub).select('email role firstName tokenVersion status').lean();
    if (u && u.status === 'active' && u.tokenVersion === p.tv) {
      req.user = { _id: u._id, email: u.email, role: u.role as Role, firstName: u.firstName, tokenVersion: u.tokenVersion };
      // sliding renewal once more than half the lifetime has passed
      if (Date.now() / 1000 - p.iat > maxAgeMs / 2000) setSession(res, u);
    }
  } catch {
    clearSession(res);
  }
  next();
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => (req.user ? next() : next(unauthorized()));

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'owner' || roles.includes(req.user.role)) return next();
    next(forbidden());
  };

export const requireStaff = requireRole(...STAFF_ROLES.filter((r) => r !== 'owner'));
export const requireOwner = requireRole('owner');

/** CSRF defence in depth: SameSite=Lax cookies + a custom header that cross-site forms cannot send. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.header('x-requested-with') !== 'wonderktm') return next(forbidden('Missing request header.'));
  next();
}
