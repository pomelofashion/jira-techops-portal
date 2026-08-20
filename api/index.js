// api/index.js
// Vercel Serverless Function entry point.
// Wraps the existing Express app for serverless execution.
// Vercel routes all /api/* requests here via vercel.json rewrites.

import app from '../server/index.js';

export default app;
