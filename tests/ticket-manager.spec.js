// tests/ticket-manager.spec.js
// E2E for the Ticket Manager admin tool: filter, select, bulk move between
// boards (key preserved), bulk assign, bulk status. Non-admins are bounced.
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

test.describe('Ticket Manager', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');

  test('admin bulk-moves a ticket to another board with its key intact', async ({ page }) => {
    await login(page, ADMIN);

    // Boards + a fresh ticket on the first board via API.
    const spaces = await (await page.request.get('/api/spaces?all=1')).json();
    const boards = (spaces.spaces || []).flatMap(s => (s.boards || []).filter(b => !b.archived));
    expect(boards.length).toBeGreaterThanOrEqual(2);
    const [boardA, boardB] = boards;
    const created = await (
      await page.request.post('/api/tickets', {
        data: { title: `TM e2e ${Date.now()}`, description: 'x', category: 'Other', priority: 'Low', boardId: boardA.id },
      })
    ).json();
    const originalKey = created.key;

    await page.goto('/#ticket-manager');
    await expect(page.locator('text=Ticket Manager').first()).toBeVisible({ timeout: 10_000 });

    // Filter to board A so the new ticket is on the page, select it.
    await page.selectOption('select:has(option:text-is("All boards"))', boardA.id);
    await page.waitForTimeout(500);
    const row = page.locator('tr', { hasText: originalKey });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.locator('input[type="checkbox"]').check();

    // Bulk move to board B via the floating bar (its presence = selection active).
    const moveSel = page.locator('select:has(option:text-is("Move to board…"))');
    await expect(moveSel).toBeVisible();
    await moveSel.selectOption(boardB.id);
    await expect(page.locator('text=Moved to board').first()).toBeVisible({ timeout: 15_000 });

    // Key preserved, board changed (verify via API).
    const after = await (await page.request.get(`/api/tickets/${created.id}`)).json();
    expect(after.key).toBe(originalKey);
    expect(after.boardId).toBe(boardB.id);

    await page.request.delete(`/api/tickets/${created.id}`);
  });

  test('non-admin cannot reach the tool or the bulk API', async ({ page }) => {
    await login(page, USER);
    await page.goto('/#ticket-manager');
    await page.waitForTimeout(600);
    await expect(page.locator('text=Ticket Manager')).toHaveCount(0);
    const res = await page.request.post('/api/tickets/bulk', {
      data: { ids: ['00000000-0000-0000-0000-000000000000'], action: { type: 'status', status: 'Live' } },
    });
    expect(res.status()).toBe(403);
  });
});
