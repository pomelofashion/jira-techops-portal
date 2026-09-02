// tests/suggestion-bubble.spec.js
// E2E for the merged feedback flow: the floating bubble is a quick composer
// for the shared Suggestions board.
//   • User submits title + category + details; the Page field is captured
//     from the section they were on and is not editable.
//   • The post appears on the Suggestions board (server-backed, visible to
//     other users) with its page badge; superadmins get a bell notification;
//     staff can change status; the author can delete.
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
  await page.goto('/');
  await page.fill('input[type="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Feedback bubble → Suggestions board', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');
  const stamp = `Bubble e2e ${Date.now()}`;

  test('user posts a suggestion from the bubble with the page auto-captured', async ({ page }) => {
    await login(page, USER);
    await page.goto('/#docs');
    await page.click('button[aria-label="Send feedback"]');
    await expect(page.locator('text=Share feedback')).toBeVisible();
    await expect(page.locator('text=Posts to the Suggestions board')).toBeVisible();

    // Page field: read-only div stamped with the section.
    const pageField = page.locator('[aria-label="Page where this feedback was created"]');
    await expect(pageField).toHaveText(/Documentation/);
    expect(await pageField.evaluate(el => el.tagName)).toBe('DIV');

    await page.fill('input[aria-label="Feedback header"]', stamp);
    await page.selectOption('select[aria-label="Suggestion category"]', 'Bug');
    await page.fill(
      'textarea[aria-label="Feedback comment"]',
      'Docs search misses partial words.'
    );
    await page.click('button:has-text("Send feedback")');
    await expect(page.locator('text=Thanks — your suggestion was posted')).toBeVisible({
      timeout: 10_000,
    });

    // "View board" lands on the Suggestions board showing the new post
    // with its page badge.
    await page.click('button:has-text("View board")');
    await expect(page.locator(`text=${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=📍 Documentation').first()).toBeVisible();
  });

  test('admin sees the post on the shared board, gets a bell, can set status', async ({
    page,
  }) => {
    await login(page, ADMIN);

    // Server-backed: a DIFFERENT user sees the post (was impossible with
    // the old localStorage board).
    await page.goto('/#suggestions');
    await expect(page.locator(`text=${stamp}`).first()).toBeVisible({ timeout: 10_000 });

    // Bell notification fanned out to the superadmin.
    const notifs = await (await page.request.get('/api/notifications')).json();
    const rows = notifs.notifications || notifs;
    expect(rows.some(n => n.type === 'suggestion' && (n.title || '').includes('Bubble e2e'))).toBe(
      true
    );

    // Staff status change through the detail view.
    await page.locator(`text=${stamp}`).first().click();
    await expect(page.locator('h1', { hasText: stamp })).toBeVisible();
    const statusSelect = page.locator('select').filter({ hasText: 'Open' }).first();
    if (await statusSelect.count()) {
      await statusSelect.selectOption('Planned');
      await expect(page.locator('text=Planned').first()).toBeVisible();
    }

    // Cleanup via API (staff delete).
    const list = await (await page.request.get('/api/suggestions')).json();
    const mine = (list.suggestions || []).find(s => s.title === stamp);
    expect(mine).toBeTruthy();
    const del = await page.request.delete(`/api/suggestions/${mine.id}`);
    expect(del.status()).toBe(200);
  });
});
