// tests/metadata-scrub.spec.js
// E2E for client-side upload metadata scrubbing (privacy):
//   • JPEG uploads are canvas re-encoded — EXIF (camera/GPS/artist) must not
//     survive into the stored original served by /api/docs/:id/file.
//   • docx uploads get docProps author/company blanked via jszip while the
//     document body stays intact.
// Also asserts the sliding-session behavior: a full page reload keeps the
// user signed in (tri-state auth boot must not flash the login screen away).
// Requires BFF + Postgres running (npm run dev:all).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });

const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;
const FIXTURES = join(__dirname, 'fixtures');

test.describe('Upload metadata scrubbing + persistent session', () => {
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

  test('EXIF and Office author metadata are stripped before storage; reload keeps the session', async ({
    page,
  }) => {
    await login(page);

    // ── Reload keeps the session (sliding 3d cookie + tri-state boot) ──
    await page.reload();
    await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // ── Upload the dirty fixtures ──
    await page.goto('/#docs');
    await page.click('button:has-text("Upload Documents")');
    await page.setInputFiles('input[type="file"]', [
      join(FIXTURES, 'exif-fixture.jpg'),
      join(FIXTURES, 'meta-fixture.docx'),
    ]);
    await expect(page.locator('text=2 files')).toBeVisible();
    await page.click('button:has-text("Upload All")');
    await expect(page.locator('text=Complete')).toHaveCount(2, { timeout: 60_000 });

    // ── Fetch the stored originals through the session ──
    const list = await (await page.request.get('/api/docs')).json();
    const docs = list.docs || list;
    const findDoc = frag =>
      docs.find(d => JSON.stringify(d).toLowerCase().includes(frag));
    const jpegDoc = findDoc('exif-fixture');
    const docxDoc = findDoc('meta-fixture');
    expect(jpegDoc, 'uploaded jpeg doc found').toBeTruthy();
    expect(docxDoc, 'uploaded docx doc found').toBeTruthy();

    // JPEG: served bytes must be a JPEG with no EXIF marker and no artist tag.
    const jpegRes = await page.request.get(`/api/docs/${jpegDoc.id}/file`);
    expect(jpegRes.status()).toBe(200);
    const jpegBytes = Buffer.from(await jpegRes.body());
    expect(jpegBytes.slice(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(jpegBytes.includes(Buffer.from('Exif'))).toBe(false);
    expect(jpegBytes.includes(Buffer.from('SECRET PHOTOGRAPHER'))).toBe(false);

    // DOCX: docProps author/company blanked, body text intact, zip still valid.
    const docxRes = await page.request.get(`/api/docs/${docxDoc.id}/file`);
    expect(docxRes.status()).toBe(200);
    const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
    const docxPath = join(dir, 'out.docx');
    writeFileSync(docxPath, Buffer.from(await docxRes.body()));
    const core = execFileSync('unzip', ['-p', docxPath, 'docProps/core.xml']).toString();
    const app = execFileSync('unzip', ['-p', docxPath, 'docProps/app.xml']).toString();
    const body = execFileSync('unzip', ['-p', docxPath, 'word/document.xml']).toString();
    expect(core).not.toContain('SECRET AUTHOR NAME');
    expect(core).not.toContain('SECRET EDITOR NAME');
    expect(core).toContain('Scrub Fixture'); // business title survives
    expect(app).not.toContain('SECRET COMPANY LTD');
    expect(app).not.toContain('SECRET MANAGER');
    expect(body).toContain('Metadata scrub fixture body text.');
  });
});
