// tests/ticket-clone.spec.js
// E2E for ticket cloning: staff clone a ticket into another board; the clone
// copies content, lands unassigned/To Do, keeps a fresh board key, and the two
// are auto-linked (clones ↔ is cloned by). Non-staff are refused.
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
  await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({ timeout: 10_000 });
}

test.describe('Ticket clone', () => {
  test.skip(!ADMIN.email || !USER.email, 'Credentials not configured');

  test('clone into another board copies content and auto-links both sides', async ({ page }) => {
    await login(page, ADMIN);
    const spaces = await (await page.request.get('/api/spaces?all=1')).json();
    const boards = (spaces.spaces || []).flatMap(s => (s.boards || []).filter(b => !b.archived));
    expect(boards.length).toBeGreaterThanOrEqual(2);
    const [boardA, boardB] = boards;

    const src = await (await page.request.post('/api/tickets', {
      data: { title: `Clone e2e ${Date.now()}`, description: 'do product work', currentResult: 'x', expectedResult: 'y', category: 'Other', priority: 'High', boardId: boardA.id },
    })).json();

    const res = await page.request.post(`/api/tickets/${src.id}/clone`, { data: { boardId: boardB.id } });
    expect(res.status()).toBe(201);
    const clone = await res.json();
    expect(clone.boardId).toBe(boardB.id);
    expect(clone.title).toBe(src.title);
    expect(clone.description).toBe('do product work');
    expect(clone.status).toBe('To Do');
    expect(clone.assigneeEmail).toBeFalsy();
    expect(clone.key).not.toBe(src.key);

    // Auto-link both directions.
    const srcFull = await (await page.request.get(`/api/tickets/${src.id}`)).json();
    const cloneFull = await (await page.request.get(`/api/tickets/${clone.id}`)).json();
    expect(srcFull.links.some(l => l.relation === 'clones' && l.ticket.key === clone.key)).toBe(true);
    expect(cloneFull.links.some(l => l.relation === 'is cloned by' && l.ticket.key === src.key)).toBe(true);

    // Assign the clone to a developer (the intended follow-up).
    const asg = await page.request.post(`/api/tickets/${clone.id}/assign`, { data: { assigneeEmail: USER.email, assigneeName: 'E2E User' } });
    expect(asg.status()).toBe(200);

    await page.request.delete(`/api/tickets/${clone.id}`);
    await page.request.delete(`/api/tickets/${src.id}`);
  });

  test('non-staff cannot clone', async ({ page }) => {
    await login(page, ADMIN);
    const src = await (await page.request.post('/api/tickets', {
      data: { title: `Clone guard ${Date.now()}`, description: 'x', category: 'Other', priority: 'Low' },
    })).json();
    await login(page, USER);
    const res = await page.request.post(`/api/tickets/${src.id}/clone`, { data: {} });
    expect(res.status()).toBe(403);
    await login(page, ADMIN);
    await page.request.delete(`/api/tickets/${src.id}`);
  });
});
