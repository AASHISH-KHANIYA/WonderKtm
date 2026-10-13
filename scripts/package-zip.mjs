#!/usr/bin/env node
/**
 * Reproducible source packaging.
 *   node scripts/package-zip.mjs [output-dir]
 * - Copies the project into a staging folder, skipping node_modules, build output, .env files, uploads, logs and zips.
 * - Refuses to continue if any packaged text file looks like it contains real credentials.
 * - Then creates wonderktm-ecommerce-source.zip using the system `zip` (macOS/Linux) or PowerShell (Windows).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? root);
const NAME = 'wonderktm-ecommerce-source';
const zipPath = path.join(outDir, `${NAME}.zip`);

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.vite', '.turbo', 'uploads-private', 'uploads-public', '.cache']);
const skipFile = (n) => (n.startsWith('.env') && n !== '.env.example') || n.endsWith('.log') || n.endsWith('.zip') || n === '.DS_Store';

const SECRET_PATTERNS = [
  [/mongodb(\+srv)?:\/\/(?!<|USER:|username:|user:)[^:\s/<]+:(?!<|PASSWORD|password|YOUR)[^@\s<]+@/, 'MongoDB connection string with credentials'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
  [/CLOUDINARY_API_SECRET\s*=\s*[A-Za-z0-9_-]{15,}/, 'Cloudinary secret'],
  [/(JWT_SECRET|SMTP_PASS)[ \t]*=[ \t]*(?![ \t]|replace|placeholder|<|dev-only|test-|smoke-)[A-Za-z0-9+/_=-]{16,}/, 'real-looking secret'],
];

const stage = fs.mkdtempSync(path.join(os.tmpdir(), `${NAME}-`));
const dest = path.join(stage, 'wonderktm');
let files = 0;
const problems = [];

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) copy(path.join(src, e.name), path.join(dst, e.name)); continue; }
    if (skipFile(e.name)) continue;
    const from = path.join(src, e.name), to = path.join(dst, e.name);
    fs.copyFileSync(from, to); files++;
    const st = fs.statSync(from);
    if (st.size < 1_000_000 && !/\.(png|jpe?g|webp|ico|woff2?|zip)$/i.test(e.name)) {
      const txt = fs.readFileSync(from, 'utf8');
      for (const [re, what] of SECRET_PATTERNS) if (re.test(txt)) problems.push(`${path.relative(root, from)}: ${what}`);
    }
  }
}
copy(root, dest);

if (problems.length) {
  console.error('Refusing to package: possible secrets found:\n - ' + problems.join('\n - '));
  fs.rmSync(stage, { recursive: true, force: true });
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(zipPath, { force: true });
try {
  if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dest}' -DestinationPath '${zipPath}' -Force`], { stdio: 'inherit' });
  else execFileSync('zip', ['-r', '-q', '-X', zipPath, 'wonderktm'], { cwd: stage, stdio: 'inherit' });
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
console.log(`Created ${zipPath} (${files} files, ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB)`);
