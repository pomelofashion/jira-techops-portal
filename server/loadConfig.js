// server/loadConfig.js
// Central environment loader. Every server entry point reaches this through
// db.js (ESM hoisting runs it before any caller's own dotenv call), so the
// precedence below holds everywhere:
//
//   real environment (Vercel dashboard, shell)  >  .env.local  >  .env
//
// .env holds the shared runtime configuration and is git-ignored — secrets
// never ride along with pushes. .env.local carries local-dev overrides
// (localhost DATABASE_URL etc.). Production does NOT read either file:
// the same variable names must be set in the Vercel dashboard
// (Settings → Environment Variables).
//
// dotenv never overrides variables that are already set, so load order
// implements the precedence: .env.local first, then .env fills the gaps.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenvConfig({ path: resolve(root, '.env.local') });
dotenvConfig({ path: resolve(root, '.env') });
