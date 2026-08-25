// tests/doc-upload.spec.js
// E2E for the any-format multi-file docs upload: per-file outcomes, the 3 MB
// cap, unknown formats stored with a download card, and the original bytes
// served back from /api/docs/:id/file. Requires the BFF + Postgres running
// (npm run dev:all) and admin creds via E2E_ADMIN_* or SEED_SUPERADMIN_* env.
// Runs headed per the QA charter (see playwright.config.js).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
const FIXTURES = join(__dirname, 'fixtures');

test.describe('Docs any-format upload', () => {
  test.skip(!EMAIL || !PASSWORD, 'Admin credentials not configured');

  async function login(page) {
    await page.goto('/');
    await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
      timeout: 10_000,
    });
  }

  test('mixed batch: readable, unknown-format, and oversize files each get their own outcome', async ({
    page,
  }) => {
    // The oversize fixture is generated per run — keeps a 3.5 MB blob out of git.
    const bigPath = join(mkdtempSync(join(tmpdir(), 'doc-upload-')), 'oversize.bin');
    writeFileSync(bigPath, Buffer.alloc(Math.round(3.5 * 1024 * 1024), 7));

    await login(page);
    await page.goto('/#docs');
    await page.click('button:has-text("Upload Documents")');

    // The dropzone accepts every type now — the copy says so.
    await expect(page.locator('text=Any file type').first()).toBeVisible();

    await page.setInputFiles('input[type="file"]', [
      join(FIXTURES, 'upload-note.md'),
      join(FIXTURES, 'archive-fixture.zip'),
      bigPath,
    ]);
    await expect(page.locator('text=3 files')).toBeVisible();

    await page.click('button:has-text("Upload All")');

    // Per-file outcomes: two Complete, one oversize Error — the batch survives.
    await expect(page.locator('text=Complete')).toHaveCount(2, { timeout: 45_000 });
    await expect(page.locator('text=File too large').first()).toBeVisible();

    // Close the modal; the unknown-format doc is in the library.
    await page.click('button[aria-label="Close"]');
    await page.click('button[aria-label*="Read archive-fixture"]');

    // The reader shows the original-file download card, and the served file
    // is reachable through the session (200 with the right content type).
    await expect(page.locator('text=Original file')).toBeVisible({ timeout: 10_000 });
    const link = page.locator('a[href*="/api/docs/"][href$="/file"]').first();
    const href = await link.getAttribute('href');
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('zip');
  });
});
