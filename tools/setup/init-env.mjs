#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  email: { type: 'string' }, name: { type: 'string', default: 'Workspace owner' },
  origin: { type: 'string' },
  port: { type: 'string', default: '4311' },
} });
if (!values.email || /['\\\r\n]/.test(values.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
  console.error('Usage: node tools/setup/init-env.mjs --email owner@example.com [--origin https://review.example.com]');
  process.exit(1);
}
const origin = new URL(values.origin ?? `http://localhost:${values.port}`);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Origin must be a plain HTTP(S) origin');
if (origin.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Remote installations require HTTPS');
if (!/^\d+$/.test(values.port) || +values.port < 1024 || +values.port > 65535) throw new Error('Choose an unprivileged port between 1024 and 65535');
if (/[^\p{L}\p{N} ._-]/u.test(values.name)) throw new Error('Name may contain letters, numbers, spaces, periods, underscores and hyphens');
for (const file of ['.env', '.data/bootstrap-password']) {
  try { await lstat(file); throw new Error(`Refusing to overwrite ${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const ownerPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const repositoryKey = randomBytes(32).toString('base64');
const adminPassword = randomBytes(24).toString('base64url');
await mkdir('.data', { recursive: true, mode: 0o700 });
const lines = [
  `APP_ORIGIN=${origin.origin}`, `HOST_PORT=${values.port}`, 'HOST_BIND=127.0.0.1',
  `POSTGRES_PASSWORD=${ownerPassword}`, `APP_DATABASE_PASSWORD=${appPassword}`,
  `REPOSITORY_ENCRYPTION_KEY=${repositoryKey}`,
  `ADMIN_EMAIL='${values.email}'`, `ADMIN_NAME="${values.name}"`,
];
await writeFile('.env', lines.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
await writeFile('.data/bootstrap-password', adminPassword + '\n', { flag: 'wx', mode: 0o600 });
console.log(`Created protected configuration in ${resolve('.env')}. Credentials were not printed.`);
console.log('Next: docker compose up -d --build');
console.log('Then: cat .data/bootstrap-password | docker compose run --rm -T bootstrap');
console.log('The initial password is in .data/bootstrap-password. Store it privately and remove that file after onboarding.');
