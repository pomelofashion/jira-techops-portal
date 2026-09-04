// tests/ticket-io.spec.js
// E2E for the Jira import / CSV export admin tool:
//   • Admin uploads a Jira CSV export → preview → import → the tickets land on
//     the board carrying their original Jira key; re-import skips duplicates.
//   • CSV export downloads and contains an imported ticket.
//   • A non-admin cannot reach #import-export and the API refuses.
// Requires BFF + Postgres (npm run dev:all).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const USER = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };
const FIXTURE = join(__dirname, 'fixtures', 'jira-export.csv');

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

test.describe('Ticket import / export', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup handled by the test itself; nothing global here.
  });

  test('admin imports a Jira CSV, preview → import → board shows it, re-import dedups', async ({
    page,
  }) => {
    await login(page, ADMIN);
    // Clean any leftovers from a prior run so the first import truly creates.
    const pre = await (await page.request.get('/api/tickets?limit=200')).json();
    for (const t of pre.tickets || pre) {
      if (['PESD-1001', 'PESD-1002', 'PESD-1003'].includes(t.jiraKey)) {
        await page.request.delete(`/api/tickets/${t.id}`);
      }
    }
    await page.goto('/#import-export');
    await expect(page.locator('h1:has-text("Import / Export")')).toBeVisible({ timeout: 10_000 });

    // Upload the fixture (hidden file input).
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator('text=3 ticket(s) ready')).toBeVisible({ timeout: 10_000 });
    // Preview shows a mapped Jira key.
    await expect(page.locator('td:has-text("PESD-1001")')).toBeVisible();

    await page.click('button:has-text("Import 3 ticket")');
    await expect(page.locator('span:has-text("3 Created")')).toBeVisible({ timeout: 20_000 });

    // The imported ticket is retrievable with its Jira key preserved.
    const list = await (await page.request.get('/api/tickets?limit=200')).json();
    const rows = list.tickets || list;
    const imported = rows.find(t => t.jiraKey === 'PESD-1001');
    expect(imported).toBeTruthy();
    expect(imported.priority).toBe('Critical'); // Highest → Critical
    expect(imported.status).toBe('In Progress');

    // Re-import the same file → all skipped.
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator('text=3 ticket(s) ready')).toBeVisible();
    await page.click('button:has-text("Import 3 ticket")');
    await expect(page.locator('span:has-text("3 Skipped (duplicate)")')).toBeVisible({ timeout: 20_000 });

    // Export includes the imported ticket.
    const csv = await (await page.request.get('/api/tickets/export.csv')).text();
    expect(csv.split('\n')[0]).toContain('jira_key');
    expect(csv).toContain('PESD-1001');

    // Cleanup the three imported tickets via a direct filter+delete.
    for (const jk of ['PESD-1001', 'PESD-1002', 'PESD-1003']) {
      const t = (list.tickets || list).find(x => x.jiraKey === jk)
        || (await (await page.request.get('/api/tickets?limit=200')).json()).tickets?.find(
          x => x.jiraKey === jk
        );
      if (t) await page.request.delete(`/api/tickets/${t.id}`);
    }
  });

  test('non-admin is blocked from the tool and the API', async ({ page }) => {
    await login(page, USER);
    await page.goto('/#import-export');
    await page.waitForTimeout(600);
    await expect(page.locator('h1:has-text("Import / Export")')).toHaveCount(0);
    const res = await page.request.get('/api/tickets/export.csv');
    expect(res.status()).toBe(403);
  });
});
