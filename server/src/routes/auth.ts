import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { clearSession, requireAuth, setSession } from '../middleware/auth.js';
import { limiter, validate } from '../middleware/common.js';
import { AppError, badRequest, unauthorized } from '../utils/errors.js';
import { asyncHandler, randomToken, sha256 } from '../utils/helpers.js';
import { changePasswordSchema, forgotSchema, loginSchema, profileSchema, registerSchema, resetSchema, savedAddressSchema } from '../validators/schemas.js';
import { notify } from '../services/email.js';

export const authRouter = Router();
const authLimiter = limiter(15, 30);
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const publicUser = (u: any) => ({ id: String(u._id), email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, role: u.role, emailVerified: u.emailVerified, marketingConsent: u.marketingConsent, addresses: u.addresses ?? [] });

authRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  if (await User.exists({ email: b.email })) throw new AppError(409, 'An account with this email already exists. Try signing in.', 'EMAIL_TAKEN');
  const verifyToken = randomToken();
  // role is NEVER taken from the request: public registration always yields a customer.
  const user = await User.create({ email: b.email, passwordHash: await bcrypt.hash(b.password, 12), firstName: b.firstName, lastName: b.lastName, phone: b.phone, marketingConsent: b.marketingConsent, role: 'customer', verifyTokenHash: sha256(verifyToken) });
  void notify('registration', user.email, { name: user.firstName });
  void notify('email_verification', user.email, { url: `${env.CLIENT_URL}/verify-email?token=${verifyToken}` });
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = await bcrypt.compare(req.body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.status !== 'active') throw unauthorized('Incorrect email or password.');
  user.lastLoginAt = new Date();
  await user.save();
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

authRouter.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

authRouter.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user!._id }, { $inc: { tokenVersion: 1 } });
  clearSession(res);
  res.json({ ok: true });
}));

authRouter.get('/me', asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = await User.findById(req.user._id).lean();
  res.json({ user: u ? publicUser(u) : null });
}));

authRouter.post('/verify-email', authLimiter, asyncHandler(async (req, res) => {
  const token = String(req.body?.token ?? '');
  if (!token) throw badRequest('Missing token.');
  const r = await User.updateOne({ verifyTokenHash: sha256(token) }, { $set: { emailVerified: true }, $unset: { verifyTokenHash: 1 } });
  if (r.modifiedCount !== 1) throw badRequest('This verification link is invalid or was already used.');
  res.json({ ok: true });
}));

// Always the same response so the endpoint cannot be used to discover which emails have accounts.
authRouter.post('/forgot-password', authLimiter, validate(forgotSchema), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email, status: 'active' });
  if (user) {
    const token = randomToken();
    await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: sha256(token), resetExpires: new Date(Date.now() + 3600_000) } });
    void notify('password_reset', user.email, { url: `${env.CLIENT_URL}/reset-password?token=${token}` });
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
}));

authRouter.post('/reset-password', authLimiter, validate(resetSchema), asyncHandler(async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 12);
  // Single-use: the conditional update only matches while the token hash is still present.
  const r = await User.updateOne({ resetTokenHash: sha256(req.body.token), resetExpires: { $gt: new Date() } }, { $set: { passwordHash: hash }, $inc: { tokenVersion: 1 }, $unset: { resetTokenHash: 1, resetExpires: 1 } });
  if (r.modifiedCount !== 1) throw badRequest('This reset link is invalid or has expired.');
  res.json({ ok: true });
}));

authRouter.patch('/profile', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user!._id }, { $set: req.body });
  res.json({ user: publicUser(await User.findById(req.user!._id)) });
}));

authRouter.post('/change-password', requireAuth, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const u = await User.findById(req.user!._id).select('+passwordHash');
  if (!u || !(await bcrypt.compare(req.body.currentPassword, u.passwordHash))) throw badRequest('Your current password is incorrect.');
  u.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  u.tokenVersion += 1; // invalidates every other session
  await u.save();
  setSession(res, u);
  res.json({ ok: true });
}));

authRouter.post('/addresses', requireAuth, validate(savedAddressSchema), asyncHandler(async (req, res) => {
  const u = await User.findById(req.user!._id);
  if (!u) throw unauthorized();
  if (u.addresses.length >= 10) throw badRequest('You can save up to 10 addresses.');
  if (req.body.isDefault || u.addresses.length === 0) u.addresses.forEach((a) => (a.isDefault = false));
  u.addresses.push({ ...req.body, isDefault: req.body.isDefault || u.addresses.length === 0 });
  await u.save();
  res.status(201).json({ addresses: u.addresses });
}));
authRouter.put('/addresses/:id', requireAuth, validate(savedAddressSchema), asyncHandler(async (req, res) => {
  const u = await User.findById(req.user!._id);
  const a = u?.addresses.id(req.params.id);
  if (!u || !a) throw new AppError(404, 'Address not found.');
  if (req.body.isDefault) u.addresses.forEach((x) => (x.isDefault = false));
  a.set(req.body);
  await u.save();
  res.json({ addresses: u.addresses });
}));
authRouter.delete('/addresses/:id', requireAuth, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user!._id }, { $pull: { addresses: { _id: req.params.id } } });
  const u = await User.findById(req.user!._id);
  res.json({ addresses: u?.addresses ?? [] });
}));
