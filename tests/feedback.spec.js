// tests/feedback.spec.js
// E2E for the platform-feedback bubble + admin inbox:
//   • Any user submits header + comment; the Page field is auto-captured
//     from the section they were on and is not editable.
//   • Superadmin sees the entry in the Feedback admin page (with the page
//     badge) plus a bell notification; can mark Reviewed and delete.
//   • A regular user cannot open the #feedback section (bounced to Home).
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

test.describe('Feedback bubble + admin inbox', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');
  const stamp = `Feedback e2e ${Date.now()}`;

  test('user submits feedback with the page auto-captured', async ({ page }) => {
    await login(page, USER);
    // Navigate to Documentation first — the captured page must reflect it.
    await page.goto('/#docs');
    await page.click('button[aria-label="Send feedback"]');
    await expect(page.locator('text=Share feedback')).toBeVisible();

    // The Page field shows the section and is a read-only div, not an input.
    const pageField = page.locator('[aria-label="Page where this feedback was created"]');
    await expect(pageField).toHaveText(/Documentation/);
    expect(await pageField.evaluate(el => el.tagName)).toBe('DIV');

    await page.fill('input[aria-label="Feedback header"]', stamp);
    await page.fill(
      'textarea[aria-label="Feedback comment"]',
      'The docs search could use fuzzy matching.'
    );
    await page.click('button:has-text("Send feedback")');
    await expect(page.locator('text=Thanks — your feedback was sent')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('admin reviews the entry in the Feedback inbox', async ({ page }) => {
    await login(page, ADMIN);
    await page.click('button[aria-label="Admin tools"]');
    await page.click('[role="menuitem"]:has-text("Feedback")');

    // Innermost div that contains both the unique title and the action
    // buttons — i.e. the feedback card itself.
    const card = page
      .locator('div')
      .filter({ hasText: stamp })
      .filter({ has: page.locator('button:has-text("Delete")') })
      .last();
    await expect(page.locator(`span:has-text("${stamp}")`).first()).toBeVisible({
      timeout: 10_000,
    });
    // Page badge captured from the submit context.
    await expect(page.locator('span:has-text("📍 Documentation")').first()).toBeVisible();

    // Bell notification fanned out to the superadmin.
    const notifs = await (await page.request.get('/api/notifications')).json();
    const rows = notifs.notifications || notifs;
    expect(
      rows.some(n => n.type === 'feedback' && (n.title || '').includes('Feedback e2e'))
    ).toBe(true);

    // Triage: mark reviewed, then delete (two-step confirm).
    await card.locator('button:has-text("Mark reviewed")').first().click();
    await expect(card.locator('span:has-text("Reviewed")').first()).toBeVisible();
    await card.locator('button:has-text("Delete")').first().click();
    await card.locator('button:has-text("Confirm delete")').first().click();
    await expect(page.locator(`span:has-text("${stamp}")`)).toHaveCount(0);
  });

  test('regular user is bounced from the feedback section', async ({ page }) => {
    await login(page, USER);
    await page.goto('/#feedback');
    await page.waitForTimeout(600);
    await expect(page.locator('h1:has-text("💡 Feedback")')).toHaveCount(0);
  });
});
