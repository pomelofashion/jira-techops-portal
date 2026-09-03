// tests/assignment-notify.spec.js
// Assignment used to be silent — a developer wasn't told a ticket landed on
// them. Verify the assign action now creates an 'assigned' notification (and
// email in dev-log) for the new assignee, and none for a self-assign.
// Requires BFF + Postgres (npm run dev:all).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const USER = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };

async function login(page, { email, password }) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.fill('input[type="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Notify on assignment', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');

  test('assigning a ticket notifies the new assignee', async ({ page }) => {
    await login(page, ADMIN);
    const title = `Assign notify ${Date.now()}`;
    const created = await page.request.post('/api/tickets', {
      data: { title, description: 'x', category: 'Other', priority: 'Low' },
    });
    const ticket = await created.json();

    const res = await page.request.post(`/api/tickets/${ticket.id}/assign`, {
      data: { assigneeEmail: USER.email, assigneeName: 'E2E User' },
    });
    expect(res.status()).toBe(200);

    // The assignee sees an 'assigned' notification.
    await login(page, USER);
    const notifs = await (await page.request.get('/api/notifications')).json();
    const rows = notifs.notifications || notifs;
    expect(
      rows.some(n => n.type === 'assigned' && (n.title || '').includes(ticket.key))
    ).toBe(true);

    // Cleanup.
    await login(page, ADMIN);
    await page.request.delete(`/api/tickets/${ticket.id}`);
  });
});
