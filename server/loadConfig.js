// server/loadConfig.js
// Loads config.json into process.env. Because this uses createRequire,
// Vercel's bundler includes config.json in the deployed function automatically.
// Environment variables (Vercel dashboard, .env.local) always take priority.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('./config.json');

for (const [key, value] of Object.entries(config)) {
  if (!process.env[key]) {
    process.env[key] = String(value);
  }
}
