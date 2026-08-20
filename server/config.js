// server/config.js
// Production config. Imported statically so Vercel's bundler always includes it.
// Environment variables (Vercel dashboard, .env.local) take priority over these.

export default {
  DATABASE_URL: 'postgresql://neondb_owner:npg_vgWYyl6dtP7Q@ep-shy-firefly-azgd5a65-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
  JWT_SECRET: '31c17bc69ccb1ff77b4d869d5554de538fdc176638fc53ce445c1cfc175a1404819d1030c624a2b6ed5deb825cb95b7b',
  JIRA_API_TOKEN: 'cXVlbnRvbi5kQHBvbWVsb2Zhc2hpb24uY29tOkFUQVRUM3hGZkdGMGdGN3NPcVA5Z2g1ZkFXdEl4Z0stak5zRU5sMndvbWVfVGhnc0lUTGR3Q3Z3bmpheURINXRveGwzMjV3MWdmZEtVbHVJUnJ2WnY1bmlQbmtCMGlQa3Rpb1NfdkoyZXdsWHlXSVlITWdqRG8tTWhvLVJyc0JEdldiVDJrRVU2eTJpZXJJaTVWNjU0bldORkRQQjJ3ZG1KcHpVS1pwUjVlNWNxdFd1ZFdTT3IzZz05QTZERDczMQ==',
  JIRA_BASE_URL: 'https://pomelofashion.atlassian.net',
  PEM_URL: 'https://pem.pomelofashion.com/api/v2/email/custom',
  PEM_TEMPLATE_ID: '79254',
  EMAIL_FROM: 'no_reply@pmlo.co',
  APP_URL: 'https://pomelo-techops-portal.vercel.app',
  NODE_ENV: 'production',
};
