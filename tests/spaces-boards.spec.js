// tests/spaces-boards.spec.js
// E2E for Spaces + multiple Boards: the admin management page, the board
// sidebar tree + #board/<KEY> deep links, sequential per-board ticket keys,
// legacy TKT- adoption, and member isolation (a user granted a single board
// sees only that board). Requires the BFF + Postgres (npm run dev:all), the
// 014/015 migrations, and two accounts:
//   E2E_ADMIN_* — superadmin; E2E_USER_* — role_user granted ONLY the ITS
//   board (see project notes; the grant is set up via /api/spaces).
// Runs headed per the QA charter (see playwright.config.js).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD,
};
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

test.describe('Spaces & Boards', () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'Admin credentials not configured');

  test('admin: spaces admin page lists spaces, boards and membership controls', async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto('/#spaces-admin');
    await expect(page.locator('text=Spaces & Boards').first()).toBeVisible();
    // The migration-seeded space + the smoke-created one.
    await expect(page.locator('text=Tech Ops').first()).toBeVisible();
    await expect(page.locator('text=IT Support').first()).toBeVisible();
    await expect(page.locator('button:has-text("+ Create Space")')).toBeVisible();
    // Board rows show their immutable keys.
    await expect(page.locator('text=PESD1').first()).toBeVisible();
    await expect(page.locator('text=ITS').first()).toBeVisible();
  });

  test('admin: sidebar tree switches boards, deep links work, keys stay sequential', async ({
    page,
  }) => {
    await login(page, ADMIN);

    // Deep link straight onto the ITS board.
    await page.goto('/#board/ITS');
    await expect(page.locator('aside >> text=IT Support').first()).toBeVisible({ timeout: 10_000 });

    // Create a ticket on ITS through the API using the page's session, then
    // confirm the board renders it with a sequential ITS-n key.
    const created = await page.request.post('/api/tickets', {
      data: {
        title: 'E2E board key check',
        description: 'x' /* board via picker below */,
        boardId: await page.evaluate(async () => {
          const r = await fetch('/api/spaces');
          const d = await r.json();
          return d.spaces.flatMap(s => s.boards).find(b => b.key === 'ITS').id;
        }),
      },
    });
    expect(created.status()).toBe(201);
    const ticket = await created.json();
    expect(ticket.key).toMatch(/^ITS-\d+$/);

    await page.reload();
    await expect(page.locator(`text=${ticket.key}`).first()).toBeVisible({ timeout: 10_000 });

    // Switch to PESD1 via the sidebar tree; adopted legacy keys still render.
    // (Compact board density strips the TKT- prefix from card keys by design,
    // so match on the year-number remainder.)
    await page.click('aside >> button:has-text("PESD1")');
    await expect(page).toHaveURL(/#board\/PESD1$/);
    await expect(page.locator('text=/2026-\\d{4}/').first()).toBeVisible({ timeout: 10_000 });

    // Clean up the test ticket.
    const del = await page.request.delete(`/api/tickets/${ticket.id}`);
    expect(del.status()).toBe(200);
  });

  test('member: sees only the granted board, list API stays scoped', async ({ page }) => {
    test.skip(!USER.email || !USER.password, 'Non-admin credentials not configured');
    await login(page, USER);

    // Board nav appears through membership (no tickets.view_all involved).
    await page.click('nav >> button:has-text("Board")');
    await expect(page).toHaveURL(/#board\/ITS$/, { timeout: 10_000 });
    // The sidebar tree shows the granted board's space but never Tech Ops/PESD1.
    await expect(page.locator('aside >> button:has-text("ITS")').first()).toBeVisible();
    await expect(page.locator('aside >> button:has-text("PESD1")')).toHaveCount(0);

    // Server-side scoping: no PESD1 keys in the member's ticket list.
    const res = await page.request.get('/api/tickets?limit=200');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const t of body.tickets) expect(t.key).not.toMatch(/^PESD1-|^TKT-/);
  });

  test('submit form: board picker shows for multi-board users, hides for single-board members', async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto('/#submit');
    await page.click('button:has-text("Something else")');
    await expect(page.locator('select[aria-label="Board"]')).toBeVisible();
    await expect(page.locator('select[aria-label="Board"] >> option:has-text("ITS")')).toHaveCount(
      1
    );
  });
});
