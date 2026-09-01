// tests/doc-tables.spec.js
// E2E for structured-upload table extraction + the full-page edit flow:
//   • CSV / XLSX / DOCX-with-table uploads produce markdown tables
//     (| --- | separator) that the reader renders as real <table>s.
//   • Editing happens on the full-page reader (no popup): Read article →
//     Edit → change title → Save → reader reflects it, version snapshotted.
// Requires BFF + Postgres running (npm run dev:all).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
const FIXTURES = join(__dirname, 'fixtures');

test.describe('Structured uploads become tables + full-page editing', () => {
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

  test('csv, xlsx and docx uploads produce rendered tables', async ({ page }) => {
    await login(page);
    await page.goto('/#docs');
    await page.click('button:has-text("Upload Documents")');
    await page.setInputFiles('input[type="file"]', [
      join(FIXTURES, 'table-fixture.csv'),
      join(FIXTURES, 'table-fixture.xlsx'),
      join(FIXTURES, 'table-fixture.docx'),
    ]);
    await expect(page.locator('text=3 files')).toBeVisible();
    await page.click('button:has-text("Upload All")');
    await expect(page.locator('text=Complete')).toHaveCount(3, { timeout: 60_000 });
    await page.click('button[aria-label="Close"]');

    // All three stored docs carry a proper markdown table separator.
    const list = await (await page.request.get('/api/docs')).json();
    const docs = list.docs || list;
    for (const frag of ['table-fixture']) {
      const hits = docs.filter(d => JSON.stringify(d).toLowerCase().includes(frag));
      expect(hits.length).toBeGreaterThanOrEqual(3);
      for (const d of hits) {
        const full = await (await page.request.get(`/api/docs/${d.id}`)).json();
        expect(full.content, `${d.title} has table separator`).toMatch(/\|\s*---\s*\|/);
      }
    }

    // XLSX parse produced the sheet heading and its cell data.
    const xlsxDoc = docs.find(d => JSON.stringify(d).includes('table-fixture.xlsx'));
    expect(xlsxDoc).toBeTruthy();
    const xlsxFull = await (await page.request.get(`/api/docs/${xlsxDoc.id}`)).json();
    expect(xlsxFull.content).toContain('## Inventory');
    expect(xlsxFull.content).toContain('| Laptop | 14 |');

    // Reader spot-check: any of the three renders a real <table> with its
    // fixture cells (all share the "table-fixture" title, so take the first).
    await page.fill('input[placeholder*="Search" i]', 'table-fixture');
    await page.locator('button:has-text("Read article")').first().click();
    await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('td').first()).toBeVisible();
  });

  test('editing happens on the full page, no popup, with version snapshot', async ({ page }) => {
    await login(page);
    await page.goto('/#docs');

    // Open the first doc full-page via its card.
    await page.locator('button:has-text("Read article")').first().click();
    await expect(page.locator('button:has-text("← Back to library")')).toBeVisible({
      timeout: 10_000,
    });

    // Edit happens in place — no dialog/modal overlay appears.
    await page.click('button[aria-label="Edit document"]');
    const titleInput = page.locator('input[aria-label="Document title"]');
    await expect(titleInput).toBeVisible();
    await expect(page.locator('div[role="dialog"]')).toHaveCount(0);
    // Still on the full page (back button + sidebar remain).
    await expect(page.locator('button:has-text("← Back to library")')).toBeVisible();

    const stamp = `Edited inline ${Date.now()}`;
    await titleInput.fill(stamp);
    await page.click('button:has-text("Save changes")');

    // Back to read mode with the new title rendered as the article h1.
    await expect(page.locator(`h1:has-text("${stamp}")`)).toBeVisible({ timeout: 10_000 });

    // The save snapshotted a version.
    const list = await (await page.request.get('/api/docs')).json();
    const doc = (list.docs || list).find(d => d.title === stamp);
    expect(doc).toBeTruthy();
    const versions = await (await page.request.get(`/api/docs/${doc.id}/versions`)).json();
    expect((versions.versions || versions).length).toBeGreaterThanOrEqual(1);
  });
});
