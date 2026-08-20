// server/loadConfig.js
// Loads config.js into process.env. Standard ESM import — Vercel bundles it.
// Environment variables (Vercel dashboard, .env.local) always take priority.

import config from './config.js';

for (const [key, value] of Object.entries(config)) {
  if (!process.env[key]) {
    process.env[key] = String(value);
  }
}
