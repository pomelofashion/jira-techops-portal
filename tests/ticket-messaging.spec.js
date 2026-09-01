// tests/ticket-messaging.spec.js
// E2E for the ticket-communication overhaul: conversation privacy (requester +
// assignee + superadmins only), admin-tier internal notes, @mentions with
// notifications, milestone status notifications, and unread badges.
// Requires the BFF + Postgres (npm run dev:all) with migration 016, run with
// PEM_ENABLED=false so emails dev-log. Accounts (local throwaways, see project
// notes): superadmin E2E_ADMIN_*, requester E2E_USER_*, plus a role_admin and
// a role_developer account (E2E_ADMIN2_* / E2E_DEV_*).

import { test, expect } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const SUP = {
  email: process.env.E2E_ADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD,
};
const USR = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };
const ADM = {
  email: process.env.E2E_ADMIN2_EMAIL || 'e2e-admin2@example.local',
  password: process.env.E2E_ADMIN2_PASSWORD || 'E2e-Pass-1',
};
const DEV = {
  email: process.env.E2E_DEV_EMAIL || 'e2e-dev@example.local',
  password: process.env.E2E_DEV_PASSWORD || 'E2e-Pass-1',
};

async function login(page, { email, password }) {
  await page.goto('/');
  await page.fill('input[type="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await expect(page.locator('nav >> button:has-text("Submit Ticket")')).toBeVisible({
    timeout: 10_000,
  });
}

// Hard navigation: '/' -> '/#section' is a same-document hash change in the
// SPA (no reboot, no store hydration), so route via about:blank to force a
// full boot that hydrates freshly created tickets.
async function hardGoto(page, hash) {
  await page.goto('about:blank');
  await page.goto(hash);
  await page.waitForSelector('nav >> button:has-text("Submit Ticket")', { timeout: 10_000 });
}

// Create a fresh requester ticket via the API (session shared with the page).
async function createTicket(page, title) {
  const res = await page.request.post('/api/tickets', { data: { title, description: 'x' } });
  expect(res.status()).toBe(201);
  return res.json();
}

test.describe('Ticket messaging', () => {
  test.skip(!SUP.email || !SUP.password || !USR.email, 'Credentials not configured');

  test('privacy matrix: requester/assignee/superadmin see the thread; admin sees internal only; developer sees neither', async ({
    browser,
  }) => {
    const mk = async creds => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, creds);
      return page;
    };
    const sup = await mk(SUP);
    const usr = await mk(USR);
    const adm = await mk(ADM);
    const dev = await mk(DEV);

    const t = await createTicket(usr, `Privacy matrix ${Date.now()}`);
    await usr.request.post(`/api/tickets/${t.id}/comments`, { data: { body: 'help please' } });
    await sup.request.post(`/api/tickets/${t.id}/comments`, { data: { body: 'on it' } });
    await sup.request.post(`/api/tickets/${t.id}/comments`, {
      data: { body: 'secret note', internal: true },
    });

    const usrView = await (await usr.request.get(`/api/tickets/${t.id}`)).json();
    expect(usrView.conversationHidden).toBe(false);
    expect(usrView.comments.map(c => c.body)).toEqual(['help please', 'on it']);

    const devView = await (await dev.request.get(`/api/tickets/${t.id}`)).json();
    expect(devView.conversationHidden).toBe(true);
    expect(devView.comments).toHaveLength(0);
    expect(
      (await dev.request.post(`/api/tickets/${t.id}/comments`, { data: { body: 'hi' } })).status()
    ).toBe(403);
    expect(
      (
        await dev.request.post(`/api/tickets/${t.id}/comments`, {
          data: { body: 'note', internal: true },
        })
      ).status()
    ).toBe(403);

    const admView = await (await adm.request.get(`/api/tickets/${t.id}`)).json();
    expect(admView.conversationHidden).toBe(true);
    expect(admView.comments.map(c => [c.body, c.internal])).toEqual([['secret note', true]]);
    expect(
      (await adm.request.post(`/api/tickets/${t.id}/comments`, { data: { body: 'hi' } })).status()
    ).toBe(403);
    expect(
      (
        await adm.request.post(`/api/tickets/${t.id}/comments`, {
          data: { body: 'admin note', internal: true },
        })
      ).status()
    ).toBe(201);

    // Assigning the developer opens the conversation for them.
    await sup.request.post(`/api/tickets/${t.id}/assign`, {
      data: { assigneeEmail: DEV.email, assigneeName: 'E2E Dev' },
    });
    const devView2 = await (await dev.request.get(`/api/tickets/${t.id}`)).json();
    expect(devView2.conversationHidden).toBe(false);
    expect(devView2.comments.filter(c => !c.internal).length).toBeGreaterThanOrEqual(2);

    await sup.request.delete(`/api/tickets/${t.id}`);
    for (const p of [sup, usr, adm, dev]) await p.context().close();
  });

  test('mention flow: autocomplete in the composer, notification + watcher for the tagged user', async ({
    browser,
  }) => {
    const supCtx = await browser.newContext();
    const sup = await supCtx.newPage();
    await login(sup, SUP);
    const devCtx = await browser.newContext();
    const dev = await devCtx.newPage();
    await login(dev, DEV);

    const title = `Mention flow ${Date.now()}`;
    const t = await createTicket(sup, title);

    // Open the ticket via My Tickets (hard navigation hydrates the new row).
    await hardGoto(sup, '/#mytickets');
    await sup.click(`button:has-text("${title}")`);
    const composer = sup.locator('input[placeholder^="Type a message"]');
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await composer.pressSequentially('Ping @E2E D');
    await sup.click('button:has-text("e2e-dev@example.local")');
    await expect(composer).toHaveValue(/@E2E Dev /);
    await composer.press('Enter');

    // Server side: mention persisted, notification row + watcher added.
    await expect
      .poll(
        async () => {
          const n = await (await dev.request.get('/api/notifications?limit=10')).json();
          return n.notifications.some(x => x.type === 'mention' && x.ticketKey === t.key);
        },
        { timeout: 10_000 }
      )
      .toBe(true);
    const full = await (await sup.request.get(`/api/tickets/${t.id}`)).json();
    expect(full.watchers).toContain(DEV.email);
    const withMention = full.comments.find(c => c.mentions?.length);
    expect(withMention.mentions[0].email).toBe(DEV.email);

    // Bell deep link: the developer's bell opens the ticket. Hard navigation
    // first so the store holds the ticket the deep link targets.
    await hardGoto(dev, '/#home');
    await dev.click('button[aria-label*="Notification"]');
    await dev.click(`button:has-text("mentioned you on ${t.key}")`);
    await expect(dev.locator(`text=${title}`).first()).toBeVisible({ timeout: 10_000 });

    await sup.request.delete(`/api/tickets/${t.id}`);
    await supCtx.close();
    await devCtx.close();
  });

  test('unread badge on My Tickets appears on staff reply and clears after reading', async ({
    browser,
  }) => {
    const supCtx = await browser.newContext();
    const sup = await supCtx.newPage();
    await login(sup, SUP);
    const usrCtx = await browser.newContext();
    const usr = await usrCtx.newPage();
    await login(usr, USR);

    const title = `Unread badge ${Date.now()}`;
    const t = await createTicket(usr, title);
    await sup.request.post(`/api/tickets/${t.id}/comments`, { data: { body: 'staff reply' } });

    await hardGoto(usr, '/#mytickets');
    const row = usr.locator(`button:has-text("${title}")`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator('span[aria-label="Unread messages"]')).toBeVisible({
      timeout: 10_000,
    });

    // Opening the ticket stamps the read cursor server-side.
    await row.click();
    await expect
      .poll(
        async () => {
          const lst = await (await usr.request.get('/api/tickets?limit=50')).json();
          const mine = lst.tickets.find(x => x.id === t.id);
          return Boolean(mine.lastReadAt && mine.lastReadAt >= mine.lastMessageAt);
        },
        { timeout: 10_000 }
      )
      .toBe(true);

    await sup.request.delete(`/api/tickets/${t.id}`);
    await supCtx.close();
    await usrCtx.close();
  });

  test('status emails/notifications fire on milestones only', async ({ browser }) => {
    const supCtx = await browser.newContext();
    const sup = await supCtx.newPage();
    await login(sup, SUP);
    const usrCtx = await browser.newContext();
    const usr = await usrCtx.newPage();
    await login(usr, USR);

    const t = await createTicket(usr, `Milestones ${Date.now()}`);
    const count = async () => {
      const n = await (await usr.request.get('/api/notifications?limit=30')).json();
      return n.notifications.filter(x => x.type === 'status_change' && x.ticketKey === t.key)
        .length;
    };
    await sup.request.patch(`/api/tickets/${t.id}`, { data: { status: 'In Progress' } });
    await expect.poll(count, { timeout: 10_000 }).toBe(1);
    await sup.request.patch(`/api/tickets/${t.id}`, { data: { status: 'Blocked' } });
    // Non-milestone: no new notification.
    await sup.request.patch(`/api/tickets/${t.id}`, { data: { status: 'In QA' } });
    expect(await count()).toBe(1);

    await sup.request.delete(`/api/tickets/${t.id}`);
    await supCtx.close();
    await usrCtx.close();
  });
});
