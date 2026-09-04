// src/lib/jiraImport.js
// Maps a Jira "Export → CSV (all fields)" file into ticket rows this platform
// can import. Pure and testable; reuses the quote-aware parseCsv. The client
// maps + previews before sending, so what the admin sees is exactly what the
// import endpoint receives.

import { parseCsv } from './tableExtract.js';

// Jira status → this app's board columns. Exact board-column names pass
// through; anything unknown is kept verbatim (status is free-text server-side).
export const JIRA_STATUS_MAP = {
  Backlog: 'To Do',
  'Selected for Development': 'To Do',
  'To Do': 'To Do',
  Open: 'To Do',
  Reopened: 'To Do',
  'In Progress': 'In Progress',
  'In Development': 'In Progress',
  'In Review': 'Ready for Code Review',
  'Code Review': 'Ready for Code Review',
  'In QA': 'In QA',
  'Ready for QA': 'Ready for QA',
  Testing: 'In QA',
  Blocked: 'Blocked',
  'Waiting for Customer': 'Waiting for Customer',
  'Waiting for Support': 'Waiting for Support',
  'Ready to Release': 'Ready to Release',
  Done: 'Live',
  Closed: 'Live',
  Resolved: 'Live',
  Complete: 'Live',
  Cancelled: "Closed - Won't Do",
  "Won't Do": "Closed - Won't Do",
};

export const JIRA_PRIORITY_MAP = {
  Highest: 'Critical',
  Blocker: 'Critical',
  Critical: 'Critical',
  High: 'High',
  Major: 'High',
  Medium: 'Medium',
  Low: 'Low',
  Lowest: 'Low',
  Minor: 'Low',
  Trivial: 'Low',
};

const APP_ISSUE_TYPES = ['Task', 'Bug', 'Support Request', 'Incident', 'Sub-task'];
export const JIRA_ISSUETYPE_MAP = {
  Bug: 'Bug',
  Task: 'Task',
  'Sub-task': 'Sub-task',
  Subtask: 'Sub-task',
  Story: 'Task',
  Epic: 'Task',
  Incident: 'Incident',
  'Service Request': 'Support Request',
  Support: 'Support Request',
  Question: 'Support Request',
};

const mapStatus = s => JIRA_STATUS_MAP[String(s || '').trim()] || String(s || '').trim() || 'To Do';
const mapPriority = p => JIRA_PRIORITY_MAP[String(p || '').trim()] || 'Medium';
const mapIssueType = t => {
  const v = String(t || '').trim();
  return JIRA_ISSUETYPE_MAP[v] || (APP_ISSUE_TYPES.includes(v) ? v : 'Task');
};

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// Jira dates vary by instance locale. Try native parsing, then the common
// "dd/MMM/yy h:mm a" export format. Returns an ISO string or null.
export function parseJiraDate(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  const native = new Date(s);
  if (!Number.isNaN(native.getTime())) return native.toISOString();
  const m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    const day = +m[1];
    const mon = MONTHS[m[2].toLowerCase()];
    let year = +m[3];
    if (year < 100) year += 2000;
    let hour = +m[4];
    const min = +m[5];
    const ap = (m[6] || '').toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    if (mon !== undefined) {
      const d = new Date(year, mon, day, hour, min);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

// Field → the header aliases Jira uses (lowercased). "labels" is intentionally
// absent here: Jira repeats the "Labels" column, so it's collected separately.
const FIELD_ALIASES = {
  jiraKey: ['issue key', 'key'],
  title: ['summary'],
  description: ['description'],
  status: ['status'],
  priority: ['priority'],
  issueType: ['issue type', 'issuetype'],
  assigneeName: ['assignee'],
  assigneeEmail: ['assignee id', 'assignee email'],
  requesterName: ['reporter', 'creator'],
  requesterEmail: ['reporter id', 'reporter email', 'creator id'],
  category: ['component/s', 'components', 'component'],
  dueDate: ['due date'],
  createdAt: ['created'],
  updatedAt: ['updated'],
  resolvedAt: ['resolved', 'resolution date'],
};

// Build { field: columnIndex } plus the list of "Labels" column indices, from
// the header row. First matching column wins for single-valued fields.
export function detectColumns(headerRow) {
  const norm = headerRow.map(h =>
    String(h || '')
      .trim()
      .toLowerCase()
  );
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = norm.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  const labelCols = [];
  norm.forEach((h, i) => {
    if (h === 'labels' || h === 'label') labelCols.push(i);
  });
  return { map, labelCols };
}

// Parse a Jira CSV export into { columns, rows, warnings }. rows are ready for
// POST /api/tickets/import; columns lists which fields were detected (for the
// preview); warnings flags anything the admin should know before importing.
export function mapRows(csvText) {
  const table = parseCsv(csvText || '');
  if (!table.length) return { columns: {}, rows: [], warnings: ['The file is empty.'] };
  const [header, ...body] = table;
  const { map, labelCols } = detectColumns(header);
  const warnings = [];
  if (map.jiraKey === undefined)
    warnings.push('No "Issue key" column found — imported tickets will have no Jira reference.');
  if (map.title === undefined)
    warnings.push('No "Summary" column found — rows without a title will be skipped.');

  const cell = (row, idx) => (idx === undefined ? '' : String(row[idx] ?? '').trim());
  const rows = [];
  let skippedNoTitle = 0;
  body.forEach((row, i) => {
    const title = cell(row, map.title);
    if (!title) {
      skippedNoTitle++;
      return;
    }
    const labels = labelCols.map(idx => String(row[idx] ?? '').trim()).filter(Boolean);
    rows.push({
      jiraKey: cell(row, map.jiraKey) || `IMPORT-${i + 1}`,
      title: title.slice(0, 500),
      description: cell(row, map.description).slice(0, 50000),
      status: mapStatus(cell(row, map.status)),
      priority: mapPriority(cell(row, map.priority)),
      issueType: mapIssueType(cell(row, map.issueType)),
      category: cell(row, map.category) || null,
      requesterName: cell(row, map.requesterName) || null,
      requesterEmail: cell(row, map.requesterEmail) || null,
      assigneeName: cell(row, map.assigneeName) || null,
      assigneeEmail: cell(row, map.assigneeEmail) || null,
      labels,
      dueDate: parseJiraDate(cell(row, map.dueDate)),
      createdAt: parseJiraDate(cell(row, map.createdAt)),
      updatedAt: parseJiraDate(cell(row, map.updatedAt)),
      resolvedAt: parseJiraDate(cell(row, map.resolvedAt)),
    });
  });
  if (skippedNoTitle) warnings.push(`${skippedNoTitle} row(s) had no summary and will be skipped.`);
  return { columns: map, labelColumns: labelCols, rows, warnings };
}
