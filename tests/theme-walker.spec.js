// QA pass: walk every user-facing screen in BOTH themes and look for
// light-themed pockets (surfaces stuck on white when data-theme="dark")
// and obvious raw markdown leaking into the DOM. Heuristic — flags hotspots
// for a designer to review. Findings are appended to a JSON log as we go.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'alex.lee@pomelo.com',
  password: process.env.E2E_ADMIN_PASSWORD || 'Admin123!',
};
const USER = {
  email: process.env.E2E_USER_EMAIL || 'kai.nguyen@pomelo.com',
  password: process.env.E2E_USER_PASSWORD || 'User123!',
};

const OUT_DIR = path.join(process.cwd(), 'test-results', 'theme-walker');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FINDINGS_FILE = path.join(OUT_DIR, 'findings.json');
// reset findings on first run of the suite
if (!process.env.KEEP_FINDINGS) {
  fs.writeFileSync(FINDINGS_FILE, '[]');
}

function appendFinding(entry) {
  let arr = [];
  try {
    arr = JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf-8'));
  } catch {}
  arr.push(entry);
  fs.writeFileSync(FINDINGS_FILE, JSON.stringify(arr, null, 2));
}

async function freshLogin(page, { email, password }) {
  await page.goto(BASE + '/');
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

async function setTheme(page, theme) {
  await page.evaluate(t => {
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('pomelo:v1:theme', JSON.stringify(t));
    } catch {}
  }, theme);
  await page.waitForTimeout(150);
}

async function findLightPocketsInDark(page) {
  return await page.evaluate(() => {
    const out = [];
    const isLight = bg => {
      if (!bg) return false;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const p = m[1].split(',').map(s => parseFloat(s.trim()));
      const [r, g, b, a = 1] = p;
      if (a < 0.5) return false;
      return r >= 230 && g >= 230 && b >= 230;
    };
    const all = document.querySelectorAll('*');
    const seen = new Set();
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 60 || rect.height < 30) continue;
      const cs = getComputedStyle(el);
      if (!isLight(cs.backgroundColor)) continue;
      let p = el.parentElement,
        skip = false;
      while (p) {
        if (seen.has(p)) {
          skip = true;
          break;
        }
        p = p.parentElement;
      }
      if (skip) continue;
      seen.add(el);
      const pth = [];
      let cur = el;
      while (cur && pth.length < 4) {
        const tag = cur.tagName.toLowerCase();
        const cls = (cur.className || '')
          .toString()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.');
        pth.unshift(cls ? `${tag}.${cls}` : tag);
        cur = cur.parentElement;
      }
      out.push({
        selector: pth.join(' > '),
        bg: cs.backgroundColor,
        color: cs.color,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        text: (el.innerText || '').slice(0, 80).replace(/\s+/g, ' ').trim(),
      });
      if (out.length >= 8) break;
    }
    return out;
  });
}

async function findRawMarkdown(page) {
  return await page.evaluate(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue || '';
      if (/\*\*[^*]+\*\*/.test(t) || /^#{1,6}\s+\S/m.test(t)) {
        const parent = n.parentElement;
        if (!parent) continue;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'input') continue;
        const rect = parent.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        hits.push({ tag, snippet: t.trim().slice(0, 80) });
        if (hits.length >= 5) break;
      }
    }
    return hits;
  });
}

async function snap(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
}

async function audit(page, screen, theme, screenshotName) {
  await page.waitForTimeout(200);
  await snap(page, `${screenshotName}-${theme}`);
  const md = await findRawMarkdown(page);
  if (md.length) {
    appendFinding({ screen, theme, severity: 'P2', kind: 'raw-markdown', detail: md });
  }
  if (theme === 'dark') {
    const pockets = await findLightPocketsInDark(page);
    if (pockets.length) {
      appendFinding({
        screen,
        theme,
        severity: 'P2',
        kind: 'light-pocket-in-dark',
        detail: pockets,
      });
    }
  }
}

test.describe.configure({ mode: 'serial' });

for (const theme of ['light', 'dark']) {
  test.describe(`USER walk — ${theme}`, () => {
    test(`home + nav (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      await audit(page, 'Home (user)', theme, 'user-home');
    });

    test(`my-tickets list + detail (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      await page.click('button:has-text("My Tickets")').catch(() => {});
      await page.waitForTimeout(400);
      await audit(page, 'My Tickets list (user)', theme, 'user-mytickets');
      const ticket = page.locator('text=Cannot access Shopify admin panel').first();
      if (await ticket.count()) {
        await ticket.click();
        await page.waitForTimeout(400);
        await audit(page, 'Ticket detail (user)', theme, 'user-ticket-detail');
      }
    });

    test(`submit ticket (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      const submitBtn = page
        .locator(
          'button:has-text("Submit Ticket"), button:has-text("New Ticket"), button:has-text("Submit a Ticket")'
        )
        .first();
      if (await submitBtn.count()) {
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(400);
        await audit(page, 'Submit Ticket (user)', theme, 'user-submit');
      } else {
        appendFinding({
          screen: 'Submit Ticket (user)',
          theme,
          severity: 'P3',
          kind: 'navigation',
          detail: 'no Submit Ticket button found',
        });
      }
    });

    test(`docs (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      const docsBtn = page
        .locator('button:has-text("Docs"), button:has-text("Documents"), a:has-text("Docs")')
        .first();
      if (await docsBtn.count()) {
        await docsBtn.click().catch(() => {});
        await page.waitForTimeout(400);
        await audit(page, 'Docs (user)', theme, 'user-docs');
      }
    });

    test(`notification bell (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      await page.click('button[aria-label*="Notification"]').catch(() => {});
      await page.waitForTimeout(300);
      await audit(page, 'Notification dropdown (user)', theme, 'user-bell');
    });

    test(`chat assistant (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, USER);
      await setTheme(page, theme);
      await page.click('button[aria-label="Open chat assistant"]').catch(() => {});
      await page.waitForTimeout(400);
      await audit(page, 'Chat assistant (user)', theme, 'user-chat');
    });
  });

  test.describe(`ADMIN walk — ${theme}`, () => {
    test(`home (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await audit(page, 'Home (admin)', theme, 'admin-home');
    });

    test(`admin console (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await page.click('button[aria-label="Admin tools"]').catch(() => {});
      await page.waitForTimeout(200);
      await page
        .locator('[role="menuitem"]:has-text("Admin Console")')
        .click()
        .catch(() => {});
      await page.waitForTimeout(500);
      await audit(page, 'Admin Console', theme, 'admin-console');
    });

    test(`users panel (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await page.click('button[aria-label="Admin tools"]').catch(() => {});
      await page.waitForTimeout(200);
      await page
        .locator('[role="menuitem"]:has-text("Users")')
        .click()
        .catch(() => {});
      await page.waitForTimeout(500);
      await audit(page, 'Users panel', theme, 'admin-users');
    });

    test(`audit log (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await page.click('button[aria-label="Admin tools"]').catch(() => {});
      await page.waitForTimeout(200);
      await page
        .locator('[role="menuitem"]:has-text("Audit log")')
        .click()
        .catch(() => {});
      await page.waitForTimeout(500);
      await audit(page, 'Audit log', theme, 'admin-audit');
    });

    test(`chat logs (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await page.click('button[aria-label="Admin tools"]').catch(() => {});
      await page.waitForTimeout(200);
      await page
        .locator('[role="menuitem"]:has-text("Chat logs")')
        .click()
        .catch(() => {});
      await page.waitForTimeout(500);
      await audit(page, 'Chat logs', theme, 'admin-chatlogs');
    });

    test(`ticket with internal notes (${theme})`, async ({ page }) => {
      test.setTimeout(45_000);
      await freshLogin(page, ADMIN);
      await setTheme(page, theme);
      await page.click('button:has-text("My Tickets")').catch(() => {});
      await page.waitForTimeout(400);
      const ticket = page.locator('text=Cannot access Shopify admin panel').first();
      if (await ticket.count()) {
        await ticket.click();
        await page.waitForTimeout(400);
        await audit(page, 'Ticket detail w/ internal notes (admin)', theme, 'admin-ticket');
      }
    });
  });

  test(`login page (${theme})`, async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto(BASE + '/');
    await page.evaluate(() => {
      sessionStorage.clear();
      Object.keys(localStorage)
        .filter(k => k.startsWith('pomelo:') && k !== 'pomelo:v1:theme')
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await setTheme(page, theme);
    await audit(page, 'Login page', theme, 'login');
  });
}
