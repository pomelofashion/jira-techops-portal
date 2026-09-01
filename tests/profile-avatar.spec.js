// tests/profile-avatar.spec.js
// E2E for self-service profile pictures: upload via the profile modal,
// avatar renders in the nav, survives a reload (persisted server-side),
// and can be removed. Requires BFF + Postgres (npm run dev:all).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const EMAIL = process.env.E2E_USER_EMAIL || process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD || process.env.E2E_ADMIN_PASSWORD;

test.describe('Profile avatar upload', () => {
  test.skip(!EMAIL || !PASSWORD, 'Credentials not configured');

  test('upload, persist across reload, remove', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
      timeout: 10_000,
    });

    // Open the profile modal from the nav avatar.
    await page.click('button[aria-label^="Open profile"]');
    await expect(page.locator('[role="dialog"][aria-label="Profile"]')).toBeVisible();

    // Pick an image through the hidden input (the EXIF fixture doubles as
    // proof the canvas re-encode path is exercised).
    await page.setInputFiles(
      '[role="dialog"] input[type="file"]',
      join(__dirname, 'fixtures', 'exif-fixture.jpg')
    );

    // The modal avatar becomes an image and the remove link appears.
    await expect(page.locator('[role="dialog"] img[alt="Profile"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('button:has-text("Remove photo")')).toBeVisible();

    // Nav avatar switches from initials to the image.
    await expect(page.locator('nav img').first()).toBeVisible();

    // Persisted: reload keeps the picture (served from the session /me).
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('nav img').first()).toBeVisible();

    // Remove restores initials.
    await page.click('button[aria-label^="Open profile"]');
    await page.click('button:has-text("Remove photo")');
    await expect(page.locator('[role="dialog"] img[alt="Profile"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('nav img')).toHaveCount(0);
  });
});
