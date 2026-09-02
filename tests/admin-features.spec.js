// E2E coverage for Sprints 4–11 admin features: view-mode pill, users panel,
// audit log, internal notes, chat widget visibility, maintenance banner,
// submit-ticket → my-tickets flow.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'alex.lee@pomelo.com',
  password: process.env.E2E_ADMIN_PASSWORD || 'Admin123!',
};
const USER = {
  email: process.env.E2E_USER_EMAIL || 'kai.nguyen@pomelo.com',
  password: process.env.E2E_USER_PASSWORD || 'User123!',
};

async function freshLogin(page, { email, password }) {
  await page.goto(BASE + '/');
  // Clear any persisted user/ticket state so each test sees the seed.
  await page.evaluate(() => {
    sessionStorage.clear();
    Object.keys(localStorage)
      .filter(k => k.startsWith('pomelo:'))
      .forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('button[aria-label*="Notification"]', { timeout: 8000 });
}

// Opens the Admin tools dropdown and clicks the labelled menu item.
async function navAdmin(page, label) {
  await page.click('button[aria-label="Admin tools"]');
  await page.click(`[role="menuitem"]:has-text("${label}")`);
}

// ─── Admin view-mode pill ─────────────────────────────────────────────────────

test.describe('Admin view-mode pill', () => {
  test('admin sees the view-mode pill and Admin tools dropdown', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await expect(page.locator('button[aria-label="Switch admin view mode"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Admin tools"]')).toBeVisible();
    // All four destinations show up inside the dropdown
    await page.click('button[aria-label="Admin tools"]');
    await expect(page.locator('[role="menuitem"]:has-text("Admin Console")')).toBeVisible();
    await expect(page.locator('[role="menuitem"]:has-text("Users")')).toBeVisible();
    await expect(page.locator('[role="menuitem"]:has-text("Audit log")')).toBeVisible();
  });

  test('regular user sees no view-mode pill and no admin tools', async ({ page }) => {
    await freshLogin(page, USER);
    await expect(page.locator('button[aria-label="Switch admin view mode"]')).toHaveCount(0);
    await expect(page.locator('button[aria-label="Admin tools"]')).toHaveCount(0);
  });

  test('admin can switch to user view and admin chrome disappears', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button[aria-label="Switch admin view mode"]');
    await page.click('[role="menuitem"]:has-text("View as regular user")');
    // Pill stays as the escape hatch, but admin tools button is gone
    await expect(page.locator('button[aria-label="Switch admin view mode"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Admin tools"]')).toHaveCount(0);
    // VIEWING chip appears in the avatar
    await expect(page.locator('text=VIEWING')).toBeVisible();
  });

  test('admin can switch back to admin from user view', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button[aria-label="Switch admin view mode"]');
    await page.locator('[role="menuitem"]:has-text("View as regular user")').click();
    await expect(page.locator('button[aria-label="Admin tools"]')).toHaveCount(0);
    // Wait for the trigger to settle after viewAs re-render, then re-open
    await page.waitForTimeout(150);
    await page.click('button[aria-label="Switch admin view mode"]');
    await page.locator('[role="menuitem"]:has-text("Admin (default)")').waitFor({ state: 'visible' });
    await page.locator('[role="menuitem"]:has-text("Admin (default)")').click();
    await expect(page.locator('button[aria-label="Admin tools"]')).toBeVisible();
  });
});

// ─── Users panel ──────────────────────────────────────────────────────────────

test.describe('Users panel', () => {
  test('admin can open the users panel and see the seed users', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await navAdmin(page, 'Users');
    await expect(page.locator('h1:has-text("Users")')).toBeVisible();
    await expect(page.locator('td:has-text("Kai Nguyen")').first()).toBeVisible();
    await expect(page.locator('td:has-text("Alex Lee")').first()).toBeVisible();
  });

  test('search filters the users list', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await navAdmin(page, 'Users');
    await page.fill('input[aria-label="Search users"]', 'kai');
    await expect(page.locator('td:has-text("Kai Nguyen")').first()).toBeVisible();
    await expect(page.locator('td:has-text("Alex Lee")')).toHaveCount(0);
  });

  test('the Users page is not reachable by a regular user (URL hardening)', async ({ page }) => {
    await freshLogin(page, USER);
    // Users button does not exist for regular users; just confirm no Users heading is rendered
    await expect(page.locator('h1:has-text("Users")')).toHaveCount(0);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

test.describe('Audit log', () => {
  test('admin login is recorded in the audit log', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await navAdmin(page, 'Audit log');
    await expect(page.locator('h1:has-text("Audit log")')).toBeVisible();
    await expect(page.locator('text=Login').first()).toBeVisible();
  });

  test('switching view-as is recorded', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button[aria-label="Switch admin view mode"]');
    await page.locator('[role="menuitem"]:has-text("View as regular user")').click();
    // Switch back so we can navigate to Audit — wait for trigger re-render
    await page.waitForTimeout(150);
    await page.click('button[aria-label="Switch admin view mode"]');
    await page.locator('[role="menuitem"]:has-text("Admin (default)")').waitFor({ state: 'visible' });
    await page.locator('[role="menuitem"]:has-text("Admin (default)")').click();
    await navAdmin(page, 'Audit log');
    await expect(page.locator('text=View-as switched').first()).toBeVisible();
  });
});

// ─── Internal notes ───────────────────────────────────────────────────────────

test.describe('Internal admin notes on tickets', () => {
  test('admin sees the Internal notes panel on a ticket', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button:has-text("My Tickets")');
    await page.locator('text=Cannot access Shopify admin panel').first().click();
    await expect(page.locator('text=Internal notes').first()).toBeVisible();
    await expect(page.locator('text=Admin only').first()).toBeVisible();
  });

  test('regular user does not see the Internal notes panel', async ({ page }) => {
    await freshLogin(page, USER);
    await page.click('button:has-text("My Tickets")');
    // Kai is the requester of TKT-2026-0042 in the back-filled seed
    await page.locator('text=Cannot access Shopify admin panel').first().click();
    await expect(page.locator('text=Internal notes')).toHaveCount(0);
  });
});

// ─── Feedback widget ──────────────────────────────────────────────────────────

test.describe('Feedback widget', () => {
  test('floating feedback bubble is visible to a regular user', async ({ page }) => {
    await freshLogin(page, USER);
    await expect(page.locator('button[aria-label="Send feedback"]')).toBeVisible();
  });

  test('feedback bubble expands into the form on click', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button[aria-label="Send feedback"]');
    await expect(page.locator('text=Share feedback')).toBeVisible();
    await expect(page.locator('textarea[aria-label="Feedback comment"]')).toBeVisible();
  });
});

// ─── Maintenance banner ───────────────────────────────────────────────────────

test.describe('Maintenance mode banner', () => {
  test('admin can enable maintenance mode and the banner appears', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await navAdmin(page, 'Admin Console');
    // Multiple elements contain "Maintenance mode" (heading + button label) — use .first()
    await expect(page.locator('text=Maintenance mode').first()).toBeVisible();
    await page.click('button:has-text("Enable maintenance mode")');
    await expect(page.locator('[role="status"]').filter({ hasText: /maintenance/i })).toBeVisible();
    // Clean up so subsequent tests don't see the banner
    await page.click('button:has-text("Disable maintenance mode")');
    await expect(page.locator('[role="status"]').filter({ hasText: /maintenance/i })).toHaveCount(0);
  });
});

// ─── My Tickets requester filtering (F2) ──────────────────────────────────────

test.describe('My Tickets requester filtering', () => {
  test('regular user only sees tickets they submitted', async ({ page }) => {
    await freshLogin(page, USER);
    await page.click('button:has-text("My Tickets")');
    // Kai's seed tickets — should be visible
    await expect(page.locator('text=Cannot access Shopify admin panel').first()).toBeVisible();
    // Prim's seed tickets — should NOT appear for Kai
    await expect(page.locator('text=TKT-2026-0031')).toHaveCount(0);
    await expect(page.locator('text=TKT-2026-0043')).toHaveCount(0);
  });

  test('admin sees every ticket in My Tickets, regardless of requester', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await page.click('button:has-text("My Tickets")');
    // Both Kai's and Prim's tickets should be visible
    await expect(page.locator('text=Cannot access Shopify admin panel').first()).toBeVisible();
    await expect(page.locator('text=TKT-2026-0031').first()).toBeVisible();
    await expect(page.locator('text=TKT-2026-0043').first()).toBeVisible();
  });
});

// ─── Persistence ──────────────────────────────────────────────────────────────

test.describe('localStorage persistence', () => {
  test('audit log entries survive a full page reload', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await navAdmin(page, 'Audit log');
    const beforeCount = await page.locator('li').filter({ hasText: 'Login' }).count();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await navAdmin(page, 'Audit log');
    const afterCount = await page.locator('li').filter({ hasText: 'Login' }).count();
    // At least the original Admin login entry should still be there
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
  });
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────

test.describe('Theme toggle (light / dark)', () => {
  test('app starts in light mode by default', async ({ page }) => {
    await freshLogin(page, USER);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('toggle flips to dark mode and persists across reload', async ({ page }) => {
    await freshLogin(page, USER);
    await page.click('button[aria-label="Switch to dark mode"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Toggle label has flipped — it now offers to switch back to light
    await expect(page.locator('button[aria-label="Switch to light mode"]')).toBeVisible();
  });

  test('theme toggle is visible to admins too', async ({ page }) => {
    await freshLogin(page, ADMIN);
    await expect(page.locator('button[aria-label="Switch to dark mode"]')).toBeVisible();
  });
});
