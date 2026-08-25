// server/loadConfig.js
// Loads config.js into process.env. Standard ESM import — Vercel bundles it.
// IMPORTANT: .env.local must be loaded HERE, before config.js is applied.
// ESM hoisting runs this module before any caller's own dotenvConfig() call,
// so without this step config.js's production DATABASE_URL silently beats
// .env.local on dev machines — and local scripts (seed/migrate/dev server)
// end up writing to the production database.
// Priority: real environment > .env.local > config.js defaults.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import config from './config.js';

dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

for (const [key, value] of Object.entries(config)) {
  if (!process.env[key]) {
    process.env[key] = String(value);
  }
}
