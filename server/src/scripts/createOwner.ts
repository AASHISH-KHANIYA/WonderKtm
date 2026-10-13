import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { emailSchema, passwordSchema } from '../validators/schemas.js';

/** One-time owner provisioning. Credentials come from env vars only (never from the web), and an existing owner blocks a second run. */
async function main() {
  const email = emailSchema.parse(env.OWNER_EMAIL);
  const password = passwordSchema.parse(env.OWNER_PASSWORD);
  await connectDb();
  if (await User.exists({ role: 'owner' })) {
    console.log('An owner account already exists. Nothing was changed. Use the admin panel to manage staff.');
    return disconnectDb();
  }
  if (await User.exists({ email })) throw new Error('That email is already registered as a customer. Use a different OWNER_EMAIL.');
  await User.create({ email, passwordHash: await bcrypt.hash(password, 12), firstName: env.OWNER_NAME || 'Owner', role: 'owner', emailVerified: true });
  console.log(`Owner account created for ${email}. Remove OWNER_PASSWORD from your environment now.`);
  await disconnectDb();
}
main().catch((e) => { console.error('Could not create owner:', e.message ?? e); process.exit(1); });
