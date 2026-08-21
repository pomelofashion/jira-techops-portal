// src/lib/constants.js
// Shared domain constants for tickets: status/priority palettes, the legacy →
// Jira Service Management status mapping, SLA targets, and the option lists
// used by the submit form. Extracted from PomeloTechOpsPortal.jsx so future
// page components can import them without pulling in the whole shell.

import { Bug, CheckSquare, LifeBuoy, Network, Siren } from 'lucide-react';

export const PRIORITY_COLORS = {
  Critical: '#DC2626',
  High: '#EA580C',
  Medium: '#CA8A04',
  Low: '#16A34A',
};

// ─── Board workflow ───────────────────────────────────────────────────────────
// The canonical ticket workflow, mirroring the real PESD1 Jira board 1:1 —
// column order IS board order. `category` follows Jira's status categories:
// 'new' (not started), 'indeterminate' (in flight), 'done' (terminal).
// These names are PESD1-native, so pushJiraTransition can resolve transitions
// by name with no mapping layer.
export const BOARD_COLUMNS = [
  { id: 'waiting-support', name: 'Waiting for Support', color: '#F97316', category: 'new' },
  { id: 'blocked', name: 'Blocked', color: '#DC2626', category: 'indeterminate' },
  {
    id: 'waiting-customer',
    name: 'Waiting for Customer',
    color: '#F59E0B',
    category: 'indeterminate',
  },
  { id: 'todo', name: 'To Do', color: '#3B82F6', category: 'new' },
  { id: 'in-progress', name: 'In Progress', color: '#8B5CF6', category: 'indeterminate' },
  { id: 'ready-qa', name: 'Ready for QA', color: '#06B6D4', category: 'indeterminate' },
  { id: 'in-qa', name: 'In QA', color: '#0E7490', category: 'indeterminate' },
  {
    id: 'ready-review',
    name: 'Ready for Code Review',
    color: '#EC4899',
    category: 'indeterminate',
  },
  { id: 'ready-release', name: 'Ready to Release', color: '#10B981', category: 'indeterminate' },
  {
    id: 'closed-wont-do',
    name: "Closed - Won't Do",
    color: 'var(--text-secondary)',
    category: 'done',
  },
  { id: 'live', name: 'Live', color: '#16A34A', category: 'done' },
];
export const BOARD_STATUS_NAMES = BOARD_COLUMNS.map(c => c.name);
const STATUS_CATEGORY = Object.fromEntries(BOARD_COLUMNS.map(c => [c.name, c.category]));
// Legacy names resolve through their canonical mapping; unknowns count as in flight.
export const statusCategoryFor = name =>
  STATUS_CATEGORY[name] || STATUS_CATEGORY[mapLegacyStatus(name)] || 'indeterminate';

// Color mapping covers both the legacy local names and the Jira Service
// Management workflow names. Unknown statuses fall back to slate gray.
export const STATUS_COLORS = {
  // Legacy local names
  Open: '#3B82F6',
  Pending: '#F59E0B',
  Resolved: '#16A34A',
  Closed: 'var(--text-secondary)',
  Done: 'var(--text-secondary)',
  // Canonical board workflow names
  ...Object.fromEntries(BOARD_COLUMNS.map(c => [c.name, c.color])),
};

export const STATUS_BG = {
  '#3B82F6': '#EFF6FF',
  '#8B5CF6': 'var(--accent-soft)',
  '#DC2626': '#FEF2F2',
  '#F59E0B': '#FFFBEB',
  '#F97316': '#FFF7ED',
  '#16A34A': '#F0FDF4',
  '#06B6D4': '#ECFEFF',
  '#0E7490': '#ECFEFF',
  '#EC4899': '#FDF2F8',
  '#10B981': '#ECFDF5',
  'var(--text-secondary)': 'var(--bg-hover)',
};

export const statusColorFor = name => STATUS_COLORS[name] || 'var(--text-secondary)';

// Maps legacy local statuses → canonical board workflow names. Completed work
// maps to Live optimistically — "Closed - Won't Do" is reserved for tickets
// explicitly closed as won't-do (no historical signal distinguishes the two).
export const LEGACY_TO_JIRA_STATUS = {
  Open: 'To Do',
  'In Progress': 'In Progress',
  Pending: 'Waiting for Customer',
  Resolved: 'Live',
  Done: 'Live',
  Closed: 'Live',
};
export const mapLegacyStatus = name => LEGACY_TO_JIRA_STATUS[name] || name;

export const SLA_DATA = [
  { priority: 'Critical', response: '15 minutes', resolution: '4 hours', color: '#DC2626' },
  { priority: 'High', response: '1 hour', resolution: '8 hours', color: '#EA580C' },
  { priority: 'Medium', response: '4 hours', resolution: '2 business days', color: '#CA8A04' },
  { priority: 'Low', response: '1 business day', resolution: '5 business days', color: '#16A34A' },
];

// Machine-readable SLA targets (hours) — mirrors SLA_DATA for breach math.
// Business days are approximated as 8h for the calculation.
export const SLA_TARGETS_HOURS = {
  Critical: { response: 0.25, resolution: 4 },
  High: { response: 1, resolution: 8 },
  Medium: { response: 4, resolution: 16 },
  Low: { response: 8, resolution: 40 },
};

// Terminal statuses. Canonical names first; legacy names kept so stale
// persisted data can never regress SLA math or CSAT gating mid-transition.
export const DONE_STATUSES = new Set(['Live', "Closed - Won't Do", 'Resolved', 'Done', 'Closed']);

// ─── Ticket labels ────────────────────────────────────────────────────────────
// Well-known labels get a fixed chip color (mirrors the real PESD1 board);
// anything else hashes onto the fallback palette so ad-hoc labels stay stable.
export const TICKET_LABELS = {
  OMEGA: { bg: '#DCFCE7', fg: '#15803D' },
  'NETSUITE SUPPORT TICKET': { bg: '#D1FAE5', fg: '#047857' },
  "MARKETPLACE TICKET'S": { bg: '#F3E8FF', fg: '#7E22CE' },
  'DATA ENGINEERING SUPPORT': { bg: '#DBEAFE', fg: '#1D4ED8' },
};
const LABEL_FALLBACKS = [
  { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FFE4E6', fg: '#BE123C' },
  { bg: '#E0E7FF', fg: '#4338CA' },
  { bg: '#CCFBF1', fg: '#0F766E' },
  { bg: '#FCE7F3', fg: '#BE185D' },
];
export const labelColorFor = label => {
  if (TICKET_LABELS[label]) return TICKET_LABELS[label];
  let h = 0;
  for (const ch of String(label)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_FALLBACKS[h % LABEL_FALLBACKS.length];
};

// Issue types (card icon + quick-create select). Sub-task is set automatically
// when a ticket is created from a parent. Icons are lucide components so every
// surface shares the portal's one icon language.
export const ISSUE_TYPES = ['Task', 'Bug', 'Support Request', 'Incident', 'Sub-task'];
export const ISSUE_TYPE_ICONS = {
  Task: CheckSquare,
  Bug: Bug,
  'Support Request': LifeBuoy,
  Incident: Siren,
  'Sub-task': Network,
};

// Incident severity scale (incidents only). SEV1 is the house-on-fire tier.
export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'];
export const SEVERITY_COLORS = {
  SEV1: '#DC2626',
  SEV2: '#EA580C',
  SEV3: '#CA8A04',
  SEV4: '#16A34A',
};

// Problem categories (pinned-fields sidebar, mirrors Jira's field).
export const PROBLEM_CATEGORIES = [
  'Access & Permissions',
  'Data Issue',
  'Integration Failure',
  'Performance',
  'Bug / Defect',
  'Configuration',
  'Feature Request',
  'Other',
];

export const PLATFORMS = [
  'Apollo',
  'NetSuite',
  'Henry',
  'API',
  'Android App',
  'iOS App',
  'iOS Web',
  'Android Web',
  'Website',
  'Marketplace',
  'Superset',
  'Store Fulfillment',
  'Netcore',
  'POMQ POS',
];

export const SHOPS = [
  'Pomelo TH',
  'Pomelo MY',
  'Pomelo SG',
  'Pomelo PH',
  'Pomelo ID',
  'Pomelo VN',
  'Shopee TH',
  'Shopee SG',
  'Lazada TH',
  'Lazada SG',
  'Tiktok TH',
  'TMall',
  'RED',
  'JD',
  'Zalora SG',
  'Zalora HK',
  'Nykaa Ind',
  'All Shops',
  'Not Applicable',
];

export const DEPARTMENTS = [
  'Marketing',
  'Merchandising',
  'Tech & Engineering',
  'Finance',
  'HR & People',
  'Operations',
  'Creative',
  'Customer Experience',
  'Leadership',
  'Other',
];
