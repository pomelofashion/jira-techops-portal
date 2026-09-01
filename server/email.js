// server/email.js
// Transactional email via Pomelo Email Manager (PEM).
//
// Endpoint: POST https://pem.pomelofashion.com/api/v2/email/custom
// Uses template_id 79254 with a dynamic "body" attribute for HTML content.
// If PEM_ENABLED is explicitly set to 'false', emails are logged to stdout
// instead so the flows are fully testable in dev.

const PEM_URL = process.env.PEM_URL || 'https://pem.pomelofashion.com/api/v2/email/custom';
const PEM_TEMPLATE_ID = Number(process.env.PEM_TEMPLATE_ID) || 79254;
const FROM_EMAIL = process.env.EMAIL_FROM || 'no_reply@pmlo.co';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Strip HTML tags to produce a plain-text fallback — reduces spam score.
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function deliver({ to, subject, html, cc }) {
  if (process.env.PEM_ENABLED === 'false') {
    console.log(
      JSON.stringify({ level: 'info', msg: 'email (dev log — PEM disabled)', to, subject })
    );
    return { delivered: false, dev: true };
  }

  const plainText = stripHtml(html);

  const payload = {
    from_email: FROM_EMAIL,
    to,
    ...(cc && { cc }),
    template_id: PEM_TEMPLATE_ID,
    subject,
    file_path: '',
    attributes: {
      body: html,
      plain_text: plainText,
    },
  };

  const resp = await fetch(PEM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`PEM email send failed (${resp.status}): ${detail.slice(0, 200)}`);
  }
  return { delivered: true };
}

const wrap = (
  heading,
  body,
  cta
) => `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#333">
<h2 style="color:#111;font-size:18px;margin-bottom:12px">${heading}</h2>
<p style="color:#444;line-height:1.6;font-size:14px;margin-bottom:16px">${body}</p>
${cta ? `<p style="margin:20px 0"><a href="${cta.href}" style="display:inline-block;background:#6366F1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">${cta.label}</a></p>` : ''}
<p style="color:#999;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Pomelo TechOps Portal<br>This is an automated notification. If you believe you received this in error, please contact your IT team.</p>
</div>`;

// User-generated text (ticket titles, message bodies) goes into HTML — escape.
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ─── Ticket communication senders (receipt / status / replies / mentions) ─────
const STATUS_COPY = {
  'In Progress': ['Work has started', 'is now being worked on.'],
  'Waiting for Customer': [
    'Your input is needed',
    'is waiting on information from you — reply on the ticket to keep things moving.',
  ],
  'Ready to Release': ['Fix queued for release', 'has a fix ready and queued for release.'],
  Live: ['Resolved', 'has been resolved and is live. Please verify everything looks right.'],
  "Closed - Won't Do": ['Closed', "was reviewed and closed without changes (won't do)."],
};

export function sendStatusChangeEmail(to, ticketKey, ticketTitle, status) {
  const [headline, line] = STATUS_COPY[status] || ['Status updated', `moved to ${esc(status)}.`];
  return deliver({
    to,
    subject: `${ticketKey}: ${headline}`,
    html: wrap(`${esc(ticketKey)} — ${headline}`, `<b>${esc(ticketTitle)}</b> ${line}`, {
      href: `${APP_URL}/#mytickets`,
      label: 'View the ticket',
    }),
  });
}

export function sendTicketCreatedEmail(to, ticketKey, ticketTitle) {
  return deliver({
    to,
    subject: `We received your request — ${ticketKey}`,
    html: wrap(
      'Your ticket is in the queue',
      `<b>${esc(ticketKey)}</b> — ${esc(ticketTitle)}<br/>The TechOps team has received your request. We'll email you as it progresses; replies land on your ticket in the portal.`,
      { href: `${APP_URL}/#mytickets`, label: 'Track your ticket' }
    ),
  });
}

export function sendReplyEmail(to, ticketKey, ticketTitle, authorName, excerpt) {
  return deliver({
    to,
    subject: `New message on ${ticketKey}`,
    html: wrap(
      `New message on ${esc(ticketKey)}`,
      `<b>${esc(authorName)}</b> wrote on <b>${esc(ticketTitle)}</b>:<br/><i>"${esc(excerpt)}"</i>`,
      { href: `${APP_URL}/#mytickets`, label: 'Open the conversation' }
    ),
  });
}

export function sendMentionEmail(to, ticketKey, ticketTitle, authorName, excerpt) {
  return deliver({
    to,
    subject: `${authorName} mentioned you on ${ticketKey}`,
    html: wrap(
      `You were mentioned on ${esc(ticketKey)}`,
      `<b>${esc(authorName)}</b> mentioned you on <b>${esc(ticketTitle)}</b>:<br/><i>"${esc(excerpt)}"</i>`,
      { href: `${APP_URL}/#mytickets`, label: 'Open the ticket' }
    ),
  });
}

export function sendVerifyEmail(to, token) {
  const href = `${APP_URL}/verify?token=${token}`;
  return deliver({
    to,
    subject: 'Verify your TechOps account',
    html: wrap(
      'Verify your account',
      'Confirm your email to finish setting up your TechOps account.',
      { href, label: 'Verify email' }
    ),
  });
}

export function sendInviteEmail(to, token, roleLabel) {
  const href = `${APP_URL}/accept-invite?token=${token}`;
  return deliver({
    to,
    subject: "You've been invited to the TechOps Portal",
    html: wrap(
      "You've been invited",
      `You've been invited to the Pomelo TechOps Portal as <b>${roleLabel || 'a member'}</b>. Set your password to get started.`,
      { href, label: 'Accept invite' }
    ),
  });
}

export function sendSlaEmail(to, ticketKey, ticketTitle, kind, metric) {
  const href = `${APP_URL}/#board`;
  const subject =
    kind === 'breached'
      ? `SLA breached: ${ticketKey} ${metric} target missed`
      : `SLA at risk: ${ticketKey} ${metric} target almost consumed`;
  return deliver({
    to,
    subject,
    html: wrap(
      kind === 'breached' ? 'SLA breached' : 'SLA at risk',
      `<b>${ticketKey}</b> — ${ticketTitle}<br/>The ${metric} SLA target ${
        kind === 'breached' ? 'has been missed' : 'is nearly consumed'
      }.`,
      { href, label: 'Open the board' }
    ),
  });
}

export function sendApprovalEmail(to, ticketKey, ticketTitle, requestedBy) {
  const href = `${APP_URL}/#approvals`;
  return deliver({
    to,
    subject: `Approval needed: ${ticketKey}`,
    html: wrap(
      'Approval needed',
      `<b>${ticketKey}</b> — ${ticketTitle}<br/>Requested by ${requestedBy}.`,
      { href, label: 'Review request' }
    ),
  });
}

export function sendApprovalDecidedEmail(to, ticketKey, ticketTitle, decision, comment) {
  const href = `${APP_URL}/#mytickets`;
  return deliver({
    to,
    subject: `${ticketKey} ${decision}`,
    html: wrap(
      `Request ${decision}`,
      `<b>${ticketKey}</b> — ${ticketTitle}<br/>${comment ? `Approver comment: "${comment}"` : ''}`,
      { href, label: 'View your tickets' }
    ),
  });
}

export function sendCsatEmail(to, ticketKey, ticketTitle, token) {
  const href = `${APP_URL}/#csat?token=${token}`;
  return deliver({
    to,
    subject: `How did we do on ${ticketKey}?`,
    html: wrap(
      'How did we do?',
      `<b>${ticketKey}</b> — ${ticketTitle} has been resolved. We'd love a quick rating.`,
      { href, label: 'Rate your experience' }
    ),
  });
}

export function sendResetEmail(to, token) {
  const href = `${APP_URL}/reset?token=${token}`;
  return deliver({
    to,
    subject: 'Reset your TechOps password',
    html: wrap(
      'Reset your password',
      "We received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, ignore this email.",
      { href, label: 'Reset password' }
    ),
  });
}
