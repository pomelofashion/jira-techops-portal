// server/loadConfig.js
// Loads config.json into process.env. Because this uses a static import,
// Vercel's bundler includes config.json in the deployed function automatically.
// Environment variables (Vercel dashboard, .env.local) always take priority.

import config from './config.json' with { type: 'json' };

for (const [key, value] of Object.entries(config)) {
  if (!process.env[key]) {
    process.env[key] = String(value);
  }
}
