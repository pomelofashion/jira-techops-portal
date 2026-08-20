// src/api/jiraApi.js
// Jira REST API v3 integration — creates Incident issues in the PESD1 project.
//
// ✅ Sprint 1 complete (2026-04-06): All Jira API calls now route through the
// BFF proxy at /api/submit-ticket. The Jira token is held server-side in the
// JIRA_API_TOKEN environment variable (no VITE_ prefix) and never reaches
// the browser bundle.
//
// In development: Vite proxies /api/* → http://localhost:3001 (see vite.config.js)
// In production:  /api/* routes to your deployed BFF (Vercel, Express, etc.)
//
// See server/index.js for the proxy implementation.
// See Sprint 1 in the APEX audit report (2026-04-06) for the full security context.
// Owner: FORGE (BE Lead) + CORTEX (CTO sign-off on architecture).
//
// Field mapping (mirrors the Google Apps Script form integration):
//   form.title           → summary
//   form.description     → steps_to_reproduce  (customfield_10251)
//   form.currentResult   → current_result       (customfield_10646)
//   form.expectedResult  → expected_result      (customfield_10647)
//   form.platforms       → platforms            (customfield_10504)
//   form.shop            → shop                 (customfield_10505)
//   form.department      → department           (customfield_10506)
//   form.priority        → priority
//   form.email           → used for confirmation display (no Jira field)

const JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL || 'https://pomelofashion.atlassian.net';
const PROJECT_ID = import.meta.env.VITE_JIRA_PROJECT_ID || '10245';
const PROJECT_KEY = import.meta.env.VITE_JIRA_PROJECT_KEY || 'PESD1';
const REPORTER_ID = import.meta.env.VITE_JIRA_REPORTER_ID || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a string in a Jira Atlassian Document Format (ADF) paragraph block. */
const adfParagraph = text => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: text || '' }],
    },
  ],
});

/**
 * Map our priority labels to Jira priority names.
 * PESD1 project priorities: Critical, High, Medium, Low
 */
const toJiraPriority = priority => {
  const map = {
    Critical: 'Critical',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
  };
  return map[priority] || 'Low';
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Create a Jira Incident issue from a ticket submission form.
 * Routes through the BFF proxy — the Jira token never touches the client.
 *
 * @param {Object} form  — the form state from SubmitPage:
 *   { email, title, description, currentResult, expectedResult,
 *     platforms, shop, department, priority, files }
 *
 * @returns {Promise<{ key: string, url: string } | { error: string }>}
 */
export async function createJiraTicket(form) {
  // Flatten arrays to comma-separated strings for the text-based custom fields
  const platformsText = Array.isArray(form.platforms)
    ? form.platforms.join(', ')
    : form.platforms || '';
  const summary = (form.title || '').replace(/[\r\n]+/g, ' ').trim();

  const body = {
    fields: {
      project: {
        id: PROJECT_ID,
        key: PROJECT_KEY,
      },
      summary,
      issuetype: { name: 'Incident' },
      priority: { name: toJiraPriority(form.priority) },
      ...(REPORTER_ID ? { reporter: { id: REPORTER_ID } } : {}),

      // Steps to reproduce / main description
      customfield_10251: adfParagraph(form.description || ''),

      // Current result
      customfield_10646: adfParagraph(form.currentResult || ''),

      // Expected result
      customfield_10647: adfParagraph(form.expectedResult || ''),

      // Platforms impacted
      customfield_10504: adfParagraph(platformsText),

      // Shop
      customfield_10505: adfParagraph(form.shop || ''),

      // Department
      customfield_10506: adfParagraph(form.department || ''),

      // Description field — used for submitter email + any attachment note
      description: adfParagraph(
        [
          form.email ? `Submitted by: ${form.email}` : '',
          form.files?.length
            ? `Attachments: ${form.files.map(f => f.name).join(', ')} (${form.files.length} file${form.files.length !== 1 ? 's' : ''} — upload manually if required)`
            : '',
        ]
          .filter(Boolean)
          .join('\n') || ''
      ),
    },
  };

  try {
    // POST to the BFF proxy — token lives in server env, never in the bundle
    const response = await fetch('/api/v1/submit-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: data?.error || `Server error ${response.status}` };
    }

    return { key: data.key, url: data.url || `${JIRA_BASE_URL}/browse/${data.key}` };
  } catch (err) {
    return { error: err?.message || 'Network error — could not reach the API proxy.' };
  }
}

/**
 * Returns true if the BFF proxy is expected to be running.
 * Kept synchronous so existing call sites don't need to be awaited.
 * If JIRA_API_TOKEN is not set on the server, createJiraTicket will return
 * { error: '...' } and the UI will display the error to the user.
 */
export const isJiraConfigured = () => true;
