import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  createContext,
  Component,
} from 'react';
import DocImportExportPage from './src/components/docs/DocImportExportPage.jsx';
import DocStudioPage from './src/components/docs/studio/DocStudioPage.jsx';
import SuggestionsPage from './src/components/suggestions/SuggestionsPage.jsx';
import ServiceCatalogPage from './src/components/catalog/ServiceCatalogPage.jsx';
import CatalogAdminPage from './src/components/catalog/CatalogAdminPage.jsx';
import MyApprovalsPage from './src/components/approvals/MyApprovalsPage.jsx';
import ApprovalPanel from './src/components/approvals/ApprovalPanel.jsx';
import AssetsPage from './src/components/assets/AssetsPage.jsx';
import IncidentsPage from './src/components/incidents/IncidentsPage.jsx';
import ProblemsPage from './src/components/problems/ProblemsPage.jsx';
import ChangesPage from './src/components/changes/ChangesPage.jsx';
import CsatPrompt from './src/components/csat/CsatPrompt.jsx';
import ReportsPage from './src/components/reports/ReportsPage.jsx';
import { createProblemFromTicket } from './src/api/problemsApi.js';
import { createJiraTicket, isJiraConfigured } from './src/api/jiraApi.js';
import { listFeaturedDocs, listDocSummaries } from './src/api/docsApi.js';
import { API_ENABLED } from './src/api/client.js';
import { compressImageToDataUrl } from './src/lib/imageUtil.js';
import * as authApi from './src/api/authApi.js';
import * as ticketsApi from './src/api/ticketsApi.js';
import * as usersApi from './src/api/usersApi.js';
import {
  submitSuggestion,
  CATEGORIES as SUGGESTION_CATEGORIES,
} from './src/components/suggestions/suggestionsStore.js';
import * as rolesApi from './src/api/rolesApi.js';
import * as spacesApi from './src/api/spacesApi.js';
import { loadStore, saveStore, clearStore } from './src/lib/store.js';
import {
  MAX_ATTEMPTS,
  LOCKOUT_MS,
  AUTH_DELAY,
  REMEMBER_KEY,
  validateCredentials as localValidateCredentials,
  setPassword as setUserPassword,
  writeSession,
  getSession,
  clearSession,
  getLockState,
  setLockState,
  clearLockState,
} from './src/lib/localAuth.js';
import { DEMO_SEED_USERS } from './src/mocks/seedUsers.js';
import {
  PRIORITY_COLORS,
  STATUS_COLORS,
  STATUS_BG,
  statusColorFor,
  statusCategoryFor,
  BOARD_COLUMNS,
  ISSUE_TYPES,
  labelColorFor,
  PROBLEM_CATEGORIES,
  LEGACY_TO_JIRA_STATUS,
  mapLegacyStatus,
  SLA_DATA,
  SLA_TARGETS_HOURS,
  DONE_STATUSES,
  PLATFORMS,
  SHOPS,
  DEPARTMENTS,
} from './src/lib/constants.js';
import { S } from './src/lib/styles.js';
import PriorityGuidePage from './src/components/pages/PriorityGuidePage.jsx';
import BoardPage from './src/components/pages/BoardPage.jsx';
import Sidebar from './src/components/Sidebar.jsx';
import SpacesAdminPage from './src/components/spaces/SpacesAdminPage.jsx';
import SLAPage from './src/components/pages/SLAPage.jsx';
import FilePreviewCard, { fileToAttachment } from './src/components/FilePreviewCard.jsx';
import {
  NotificationProvider,
  useNotifications,
  buildSeedNotifications,
  useServerNotificationSync,
} from './src/context/NotificationContext.jsx';
import NotificationBell from './src/components/NotificationBell.jsx';
import { useTheme } from './src/context/ThemeContext.jsx';
import {
  CAPABILITIES,
  SEED_ROLES,
  DEFAULT_ASSIGNEE,
  LEGACY_ROLE_TO_ROLE_ID,
  SEED_EMAIL_REWRITE,
  DEFAULT_ROLE_ID,
  RBAC_SCHEMA_VERSION,
  hasPermission,
} from './src/rbac.js';
import {
  Search,
  Wrench,
  Users as UsersIcon,
  ScrollText,
  BookOpen,
  Target,
  ClipboardList,
  Ticket,
  Home,
  PlusCircle,
  Moon,
  Sun,
  ChevronDown,
  Star,
  User,
  Eye,
  Sparkles,
  X,
  Check,
  Shield,
  Briefcase,
  Trash2,
  LayoutGrid,
  Package,
  Siren,
  SearchCheck,
  GitBranch,
  BarChart3,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';

// ─── Error Boundary ───────────────────────────────────────────────────────────
// Catches render errors in any child subtree and shows a friendly fallback
// instead of a blank white screen. Wrap major page sections with this.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(err, info) {
    console.error('[ErrorBoundary]', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{ padding: '40px 28px', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Something went wrong
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '20px',
              maxWidth: '420px',
              margin: '0 auto 20px',
            }}
          >
            {this.state.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              padding: '9px 20px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_TICKETS = [
  {
    id: 'TKT-2026-0042',
    title: 'Cannot access Shopify admin panel',
    category: 'Access & Permissions',
    priority: 'High',
    status: 'In Progress',
    created: '2026-03-24',
    updated: '2026-03-25',
    description:
      'Getting 403 error when trying to access the Shopify admin. Was working fine yesterday.',
    assignee: 'Kai Nguyen',
    department: 'Operations',
    shop: 'Pomelo TH',
    platforms: ['Shopify'],
    labels: ['OMEGA'],
    issueType: 'Bug',
    dueDate: '2026-07-18',
    timeline: [
      { date: '2026-03-24 09:15', action: 'Ticket submitted', actor: 'You' },
      { date: '2026-03-24 09:22', action: 'Ticket assigned to IT Support', actor: 'System' },
      { date: '2026-03-24 11:30', action: 'Status changed to In Progress', actor: 'Kai Nguyen' },
    ],
    messages: [
      {
        from: 'You',
        time: '2026-03-24 09:15',
        text: 'I cannot access the Shopify admin panel. Getting a 403 forbidden error.',
      },
      {
        from: 'Kai Nguyen',
        time: '2026-03-24 11:32',
        text: "Hi, I've received your ticket. Can you confirm which Shopify store you're trying to access?",
      },
      {
        from: 'You',
        time: '2026-03-24 11:45',
        text: "It's the main Pomelo store — pomelo-fashion.myshopify.com",
      },
    ],
    pullRequests: [
      {
        id: 'pr-482',
        number: 482,
        title: 'Fix 403 on Shopify admin SSO callback',
        url: 'https://github.com/pomelofashion/shopify-admin/pull/482',
        repo: 'pomelofashion/shopify-admin',
        status: 'OPEN',
        author: { name: 'Kai Nguyen', login: 'kai-nguyen' },
        sourceBranch: 'fix/sso-callback-403',
        targetBranch: 'main',
        additions: 124,
        deletions: 38,
        changedFiles: 6,
        commentCount: 4,
        reviews: [
          { reviewer: 'Prim Srisawat', state: 'CHANGES_REQUESTED' },
          { reviewer: 'Alex Lee', state: 'COMMENTED' },
        ],
        checks: { status: 'failed', passed: 9, failed: 2, pending: 0, total: 11 },
        lastUpdate: '2026-03-25T10:32:00Z',
      },
      {
        id: 'pr-475',
        number: 475,
        title: 'Add structured logging to auth middleware',
        url: 'https://github.com/pomelofashion/shopify-admin/pull/475',
        repo: 'pomelofashion/shopify-admin',
        status: 'MERGED',
        author: { name: 'Kai Nguyen', login: 'kai-nguyen' },
        sourceBranch: 'chore/auth-logging',
        targetBranch: 'main',
        additions: 61,
        deletions: 9,
        changedFiles: 3,
        commentCount: 2,
        reviews: [{ reviewer: 'Alex Lee', state: 'APPROVED' }],
        checks: { status: 'success', passed: 11, failed: 0, pending: 0, total: 11 },
        lastUpdate: '2026-03-24 16:05',
      },
      {
        id: 'pr-488',
        number: 488,
        title: 'WIP: regression test for SSO 403 path',
        url: 'https://github.com/pomelofashion/shopify-admin/pull/488',
        repo: 'pomelofashion/shopify-admin',
        status: 'DRAFT',
        author: { name: 'Prim Srisawat', login: 'prim-s' },
        sourceBranch: 'test/sso-403-regression',
        targetBranch: 'main',
        additions: 47,
        deletions: 0,
        changedFiles: 2,
        commentCount: 0,
        reviews: [],
        checks: { status: 'pending', passed: 4, failed: 0, pending: 3, total: 7 },
        lastUpdate: '2026-03-25T09:12:00Z',
      },
    ],
    development: { branches: 4, commits: 12, lastCommitAt: '2026-03-25T10:32:00Z' },
  },
  {
    id: 'TKT-2026-0038',
    title: 'Slack notifications not working on mobile',
    category: 'Software & Apps',
    priority: 'Medium',
    status: 'Live',
    created: '2026-03-20',
    updated: '2026-03-22',
    description:
      'Push notifications from Slack stopped arriving on my iPhone after the latest iOS update.',
    assignee: 'Prim Srisawat',
    department: 'Marketing',
    shop: 'Not Applicable',
    platforms: ['Internal Tools'],
    labels: ['NETSUITE SUPPORT TICKET'],
    issueType: 'Support Request',
    timeline: [
      { date: '2026-03-20 14:00', action: 'Ticket submitted', actor: 'You' },
      { date: '2026-03-20 14:10', action: 'Ticket assigned to IT Support', actor: 'System' },
      { date: '2026-03-21 10:00', action: 'Status changed to In Progress', actor: 'Prim Srisawat' },
      { date: '2026-03-22 15:30', action: 'Status changed to Resolved', actor: 'Prim Srisawat' },
    ],
    messages: [
      {
        from: 'You',
        time: '2026-03-20 14:00',
        text: 'Slack push notifications stopped working on my iPhone after updating to iOS 18.3.',
      },
      {
        from: 'Prim Srisawat',
        time: '2026-03-21 10:05',
        text: 'Please go to Settings > Notifications > Slack and toggle notifications off, then back on.',
      },
      { from: 'You', time: '2026-03-21 10:20', text: 'That worked! Thank you so much.' },
      {
        from: 'Prim Srisawat',
        time: '2026-03-22 15:30',
        text: 'Glad that resolved it! Marking this ticket as resolved. Let us know if the issue recurs.',
      },
    ],
    pullRequests: [
      {
        id: 'pr-310',
        number: 310,
        title: 'Re-register Slack push tokens after iOS upgrade',
        url: 'https://github.com/pomelofashion/mobile-notifications/pull/310',
        repo: 'pomelofashion/mobile-notifications',
        status: 'MERGED',
        author: { name: 'Prim Srisawat', login: 'prim-s' },
        sourceBranch: 'fix/slack-push-ios18',
        targetBranch: 'main',
        additions: 88,
        deletions: 21,
        changedFiles: 4,
        commentCount: 3,
        reviews: [
          { reviewer: 'Kai Nguyen', state: 'APPROVED' },
          { reviewer: 'Alex Lee', state: 'APPROVED' },
        ],
        checks: { status: 'success', passed: 14, failed: 0, pending: 0, total: 14 },
        lastUpdate: '2026-03-22 14:50',
      },
    ],
    development: { branches: 2, commits: 5, lastCommitAt: '2026-03-22T14:50:00Z' },
  },
  {
    id: 'TKT-2026-0031',
    title: 'New laptop setup request',
    category: 'Hardware',
    priority: 'Low',
    status: 'Live',
    created: '2026-03-10',
    updated: '2026-03-15',
    description: 'Need a new MacBook Pro set up for the new marketing hire starting March 17.',
    assignee: 'Kai Nguyen',
    department: 'HR & People',
    shop: 'Not Applicable',
    platforms: ['Internal Tools'],
    labels: ['OMEGA'],
    issueType: 'Task',
    timeline: [
      { date: '2026-03-10 10:00', action: 'Ticket submitted', actor: 'You' },
      { date: '2026-03-10 10:15', action: 'Ticket assigned to IT Support', actor: 'System' },
      { date: '2026-03-12 09:00', action: 'Status changed to In Progress', actor: 'Kai Nguyen' },
      { date: '2026-03-15 16:00', action: 'Status changed to Resolved', actor: 'Kai Nguyen' },
    ],
    messages: [
      {
        from: 'You',
        time: '2026-03-10 10:00',
        text: 'New hire Amara Lee starting March 17 — needs MacBook Pro with standard software bundle.',
      },
      {
        from: 'Kai Nguyen',
        time: '2026-03-12 09:05',
        text: "Confirmed. We'll have it ready by March 16.",
      },
      {
        from: 'You',
        time: '2026-03-15 16:30',
        text: 'Laptop received and looks great. Thank you!',
      },
    ],
  },
  {
    id: 'TKT-2026-0045',
    title: 'Shopee product sync failing for TH store',
    category: 'Software & Apps',
    priority: 'Critical',
    status: 'To Do',
    created: '2026-03-26',
    updated: '2026-03-26',
    description:
      'Product data is not syncing from our PIM to Shopee TH. Last successful sync was 6 hours ago. 200+ SKUs are out of date.',
    assignee: null,
    department: 'Merchandising',
    shop: 'Pomelo TH',
    platforms: ['Shopee'],
    labels: ["MARKETPLACE TICKET'S"],
    issueType: 'Bug',
    dueDate: '2026-07-05',
    timeline: [
      { date: '2026-03-26 08:10', action: 'Ticket submitted', actor: 'Sara M.' },
      { date: '2026-03-26 08:12', action: 'Ticket assigned to IT Support', actor: 'System' },
    ],
    messages: [
      {
        from: 'Sara M.',
        time: '2026-03-26 08:10',
        text: 'Shopee TH sync has been failing since 2 AM. Our inventory is out of date for 200+ SKUs.',
      },
    ],
    pullRequests: [
      {
        id: 'pr-901',
        number: 901,
        title: 'Add retry + backoff to Shopee PIM sync worker',
        url: 'https://github.com/pomelofashion/marketplace-sync/pull/901',
        repo: 'pomelofashion/marketplace-sync',
        status: 'OPEN',
        author: { name: 'Kai Nguyen', login: 'kai-nguyen' },
        sourceBranch: 'fix/shopee-sync-retry',
        targetBranch: 'main',
        additions: 203,
        deletions: 54,
        changedFiles: 9,
        commentCount: 1,
        reviews: [{ reviewer: 'Alex Lee', state: 'APPROVED' }],
        checks: { status: 'success', passed: 18, failed: 0, pending: 0, total: 18 },
        lastUpdate: '2026-03-26T07:40:00Z',
      },
    ],
    development: { branches: 3, commits: 8, lastCommitAt: '2026-03-26T07:40:00Z' },
  },
  {
    id: 'TKT-2026-0044',
    title: 'TikTok Shop banner images not displaying',
    category: 'Software & Apps',
    priority: 'High',
    status: 'To Do',
    created: '2026-03-25',
    updated: '2026-03-25',
    description:
      'Campaign banner images uploaded to TikTok Shop are not rendering. Shows broken image placeholder.',
    assignee: null,
    department: 'Marketing',
    shop: 'Pomelo TH',
    platforms: ['TikTok Shop'],
    labels: ['DATA ENGINEERING SUPPORT'],
    issueType: 'Task',
    dueDate: '2026-07-25',
    timeline: [
      { date: '2026-03-25 13:00', action: 'Ticket submitted', actor: 'Fern P.' },
      { date: '2026-03-25 13:05', action: 'Ticket assigned to IT Support', actor: 'System' },
    ],
    messages: [
      {
        from: 'Fern P.',
        time: '2026-03-25 13:00',
        text: 'Campaign banners are broken on TikTok Shop. Launch is tomorrow morning.',
      },
    ],
  },
  {
    id: 'TKT-2026-0043',
    title: 'Lazada order export missing shipping fields',
    category: 'Data & Storage',
    priority: 'Medium',
    status: 'Waiting for Customer',
    created: '2026-03-24',
    updated: '2026-03-25',
    description:
      'Weekly Lazada order export CSV is missing the shipping_method and tracking_number columns since last Tuesday.',
    assignee: 'Prim Srisawat',
    department: 'Operations',
    shop: 'Pomelo MY',
    platforms: ['Lazada'],
    timeline: [
      { date: '2026-03-24 09:00', action: 'Ticket submitted', actor: 'Ops Team' },
      { date: '2026-03-24 09:15', action: 'Ticket assigned to Prim Srisawat', actor: 'System' },
      { date: '2026-03-24 14:00', action: 'Status changed to In Progress', actor: 'Prim Srisawat' },
      {
        date: '2026-03-25 10:00',
        action: 'Status changed to Pending — awaiting vendor response',
        actor: 'Prim Srisawat',
      },
    ],
    messages: [
      {
        from: 'Ops Team',
        time: '2026-03-24 09:00',
        text: 'The Lazada export is missing shipping_method and tracking_number since March 18.',
      },
      {
        from: 'Prim Srisawat',
        time: '2026-03-24 14:05',
        text: "I've reproduced the issue. It looks like a Lazada API change on their end. Raising a vendor ticket with them now.",
      },
      {
        from: 'Prim Srisawat',
        time: '2026-03-25 10:00',
        text: 'Waiting on Lazada support response. Ticket is Pending until they confirm the API fix.',
      },
    ],
  },
  {
    id: 'TKT-2026-0041',
    title: 'Amazon SG product images aspect ratio wrong',
    category: 'Software & Apps',
    priority: 'Medium',
    status: 'In Progress',
    created: '2026-03-23',
    updated: '2026-03-25',
    description:
      'Product images on Amazon SG are showing with incorrect 4:3 crop instead of 1:1 square. Affects all 340 active listings.',
    assignee: 'Kai Nguyen',
    department: 'Merchandising',
    shop: 'Pomelo SG',
    platforms: ['Amazon'],
    timeline: [
      { date: '2026-03-23 11:00', action: 'Ticket submitted', actor: 'James T.' },
      { date: '2026-03-23 11:10', action: 'Ticket assigned to Kai Nguyen', actor: 'System' },
      { date: '2026-03-24 09:30', action: 'Status changed to In Progress', actor: 'Kai Nguyen' },
    ],
    messages: [
      {
        from: 'James T.',
        time: '2026-03-23 11:00',
        text: 'All product images on Amazon SG are showing 4:3 instead of 1:1. Started after the batch re-upload yesterday.',
      },
      {
        from: 'Kai Nguyen',
        time: '2026-03-24 09:35',
        text: "I've identified the issue — the image processor was using the wrong crop preset. Working on a fix now.",
      },
    ],
  },
  {
    id: 'TKT-2026-0039',
    title: 'Google Analytics 4 missing Shopee traffic data',
    category: 'Software & Apps',
    priority: 'Low',
    status: 'Waiting for Customer',
    created: '2026-03-21',
    updated: '2026-03-23',
    description:
      'GA4 dashboard shows no traffic attributable to Shopee referrals since March 15. UTM parameters may be stripped.',
    assignee: 'Prim Srisawat',
    department: 'Marketing',
    shop: 'All Shops',
    platforms: ['Shopee', 'Internal Tools'],
    timeline: [
      { date: '2026-03-21 15:00', action: 'Ticket submitted', actor: 'Marketing Team' },
      { date: '2026-03-21 15:10', action: 'Ticket assigned to Prim Srisawat', actor: 'System' },
      { date: '2026-03-22 10:00', action: 'Status changed to In Progress', actor: 'Prim Srisawat' },
      {
        date: '2026-03-23 14:00',
        action: 'Status changed to Pending — awaiting Marketing sign-off on UTM restructure',
        actor: 'Prim Srisawat',
      },
    ],
    messages: [
      {
        from: 'Marketing Team',
        time: '2026-03-21 15:00',
        text: 'GA4 has not been showing Shopee-attributed sessions for 6 days. We need this for the campaign report.',
      },
      {
        from: 'Prim Srisawat',
        time: '2026-03-23 14:05',
        text: 'Found the cause — Shopee is stripping UTM params on redirect. Proposed fix needs Marketing to approve a new URL structure first.',
      },
    ],
  },
];

// ─── Ticket store (in-place mutable singleton + pub/sub) ─────────────────────
// MOCK_TICKETS is the single source of truth. Pages subscribe to bumpTickets to
// re-render after mutations; updateTickets is the one mutation path.
let _ticketsVersion = 0;
const _ticketsListeners = new Set();
const bumpTickets = () => {
  _ticketsVersion++;
  _ticketsListeners.forEach(fn => fn(_ticketsVersion));
  saveStore('tickets', MOCK_TICKETS);
};
const subscribeTickets = fn => {
  _ticketsListeners.add(fn);
  return () => _ticketsListeners.delete(fn);
};
const updateTickets = updater => {
  const next = typeof updater === 'function' ? updater(MOCK_TICKETS.slice()) : updater;
  replaceArrayInPlace(MOCK_TICKETS, next);
  bumpTickets();
};
const addTicket = ticket => {
  MOCK_TICKETS.unshift(ticket);
  bumpTickets();
};
const deleteTicket = id => {
  const t = MOCK_TICKETS.find(x => x.id === id);
  updateTickets(ts => ts.filter(x => x.id !== id));
  mirror(t?.uuid && ticketsApi.deleteTicket(t.uuid));
};

// ─── Backend mirroring (API mode) ─────────────────────────────────────────────
// In backend mode the local stores act as an optimistic cache: mutations apply
// locally first (exactly as in mock mode) and are mirrored to the BFF. The
// server remains authoritative — hydrateFromBackend() re-syncs after login.
// mirror() swallows a false-y argument so call sites can guard inline:
//   mirror(t.uuid && ticketsApi.updateTicket(t.uuid, {...}))
const mirror = promise => {
  if (!API_ENABLED || !promise || typeof promise.then !== 'function') return;
  promise.then(res => {
    if (res?.error) console.warn('[api] backend mirror failed:', res.error);
  });
};

// ─── Spaces / boards store (hydrated from /api/spaces) ────────────────────────
// The server returns only the spaces + boards the session can see, each with
// the caller's effective role (myRole). Same pub/sub shape as the ticket store.
let SPACES = [];
let SPACES_LOADED = false; // distinguishes "no access" from "not fetched yet"
let _spacesVersion = 0;
const _spacesListeners = new Set();
const bumpSpaces = () => {
  _spacesVersion++;
  _spacesListeners.forEach(fn => fn(_spacesVersion));
};
const subscribeSpaces = fn => {
  _spacesListeners.add(fn);
  return () => _spacesListeners.delete(fn);
};
const setSpaces = spaces => {
  SPACES = Array.isArray(spaces) ? spaces : [];
  SPACES_LOADED = true;
  bumpSpaces();
};
const listSpacesLocal = () => SPACES;
const spacesLoaded = () => SPACES_LOADED;
const allBoards = () => SPACES.flatMap(s => s.boards || []);
const boardByKey = key => allBoards().find(b => b.key === key) || null;
const reloadSpaces = async () => {
  if (!API_ENABLED) return;
  const res = await spacesApi.listSpaces();
  if (res.data?.spaces) setSpaces(res.data.spaces);
};

// Server ticket → UI ticket. The human key drives display and local lookups
// (mock tickets use it as their id); the row uuid is kept for API calls.
const ticketFromApi = t => ({
  id: t.key || t.id,
  uuid: t.id,
  title: t.title,
  category: t.category,
  priority: t.priority,
  status: mapLegacyStatus(t.status), // ingress safety net for a not-yet-migrated DB
  created: t.created,
  updated: t.updated,
  description: t.description,
  assignee: t.assignee || null,
  assigneeEmail: t.assigneeEmail || null,
  requester: t.requester,
  department: t.department,
  shop: t.shop,
  platforms: t.platforms || [],
  labels: t.labels || [],
  dueDate: t.dueDate || null,
  problemCategory: t.problemCategory || null,
  issueType: t.issueType || 'Task',
  rank: t.rank ?? null,
  watchers: t.watchers || [],
  parentId: t.parentId || null,
  currentResult: t.currentResult || null,
  expectedResult: t.expectedResult || null,
  boardId: t.boardId || null,
  jiraKey: t.jiraKey,
  jiraSyncState: t.jiraSyncState,
  jiraSyncedAt: t.jiraSyncedAt,
  conversationHidden: !!t.conversationHidden,
  lastMessageAt: t.lastMessageAt || null,
  lastMessageAuthorEmail: t.lastMessageAuthorEmail || null,
  lastReadAt: t.lastReadAt || null,
  timeline: (t.timeline || []).map(x => ({ date: x.date, action: x.action, actor: x.actor })),
  messages: (t.comments || [])
    .filter(c => !c.internal)
    .map(c => ({
      id: c.id,
      from: c.author,
      authorEmail: c.authorEmail || null,
      time: c.time,
      text: c.body,
      mentions: c.mentions || [],
      synced: true,
    })),
  internalNotes: (t.comments || [])
    .filter(c => c.internal)
    .map(c => ({ id: c.id, author: c.author, ts: c.time, text: c.body })),
  pullRequests: [],
});

// Returns 'ok' | 'at-risk' (≥75% of resolution target) | 'breached' (past target).
// Done/Resolved/Closed tickets always return 'ok'.
const slaStateFor = ticket => {
  if (!ticket || !ticket.created || DONE_STATUSES.has(ticket.status)) return 'ok';
  const target = SLA_TARGETS_HOURS[ticket.priority];
  if (!target) return 'ok';
  const ageHrs = (Date.now() - new Date(ticket.created).getTime()) / 3600000;
  if (ageHrs >= target.resolution) return 'breached';
  if (ageHrs >= target.resolution * 0.75) return 'at-risk';
  return 'ok';
};

// ─── Jira workflow (live, with fallback) ──────────────────────────────────────
// Loaded from the BFF on app boot; cached in memory. The fallback is the
// canonical 11-status board workflow (BOARD_COLUMNS) so a stale cache or a
// startup race never breaks the UI. Note: the Board page always renders the
// fixed BOARD_COLUMNS — the live fetch informs transition displays only.
const JIRA_DEFAULT_STATUSES = BOARD_COLUMNS.map(c => ({ name: c.name, category: c.category }));
let JIRA_WORKFLOW = {
  statuses: JIRA_DEFAULT_STATUSES,
  source: 'fallback',
  loadedAt: null,
  note: null,
};
const _jiraWorkflowListeners = new Set();
const subscribeJiraWorkflow = fn => {
  _jiraWorkflowListeners.add(fn);
  return () => _jiraWorkflowListeners.delete(fn);
};
const setJiraWorkflow = payload => {
  JIRA_WORKFLOW = { ...payload, loadedAt: new Date().toISOString() };
  _jiraWorkflowListeners.forEach(fn => fn(JIRA_WORKFLOW));
};
const getJiraWorkflow = () => JIRA_WORKFLOW;

// Push a status transition to Jira via BFF. Updates jiraSyncState/syncedAt
// on the matching local ticket. Returns { ok, error? }.
const pushJiraTransition = async (ticket, newStatus) => {
  if (!ticket?.jiraKey) return { ok: false, error: 'no-jira-key' };
  updateTickets(ts => ts.map(t => (t.id === ticket.id ? { ...t, jiraSyncState: 'syncing' } : t)));
  try {
    const res = await fetch('/api/v1/jira/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ticket.jiraKey, statusName: newStatus }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      updateTickets(ts =>
        ts.map(t =>
          t.id === ticket.id
            ? { ...t, jiraSyncState: 'error', jiraSyncError: err?.error || 'HTTP ' + res.status }
            : t
        )
      );
      recordAudit(
        'ticket.jira_transition_failed',
        _currentActor,
        { type: 'ticket', id: ticket.id, label: ticket.title },
        { jiraKey: ticket.jiraKey, target: newStatus, error: err?.error }
      );
      return { ok: false, error: err?.error || 'HTTP ' + res.status };
    }
    const data = await res.json();
    updateTickets(ts =>
      ts.map(t =>
        t.id === ticket.id
          ? {
              ...t,
              jiraSyncState: 'synced',
              jiraSyncedAt: new Date().toISOString(),
              jiraSyncError: null,
            }
          : t
      )
    );
    recordAudit(
      'ticket.jira_transition',
      _currentActor,
      { type: 'ticket', id: ticket.id, label: ticket.title },
      { jiraKey: ticket.jiraKey, status: data.status }
    );
    return { ok: true, status: data.status };
  } catch (err) {
    updateTickets(ts =>
      ts.map(t =>
        t.id === ticket.id ? { ...t, jiraSyncState: 'error', jiraSyncError: err.message } : t
      )
    );
    return { ok: false, error: err.message };
  }
};

// Poll Jira for changes since `lastSyncAt`. Reconciles local tickets whose
// jiraKey matches a returned issue. Issues not yet known locally are ignored
// for now (we don't auto-create stubs). Returns the latest fetchedAt.
// One cursor per Jira project — boards can mirror different projects
// (boards.jira_project_key), so their polls track independently.
const LAST_JIRA_POLL_AT = new Map();
const pollJira = async (project = 'PESD1') => {
  try {
    const last = LAST_JIRA_POLL_AT.get(project);
    const since = last ? `&since=${encodeURIComponent(last)}` : '';
    const res = await fetch(`/api/v1/jira/poll?project=${encodeURIComponent(project)}${since}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.fetchedAt) LAST_JIRA_POLL_AT.set(project, data.fetchedAt);
    if (data.unavailable || !Array.isArray(data.issues) || data.issues.length === 0) return data;

    // Reconcile: update any local ticket whose jiraKey matches; for Jira-side
    // issues we don't have locally, create a stub so admins see them.
    const byKey = new Map(data.issues.map(i => [i.key, i]));
    let touched = 0;
    let created = 0;
    updateTickets(ts => {
      const knownKeys = new Set(ts.filter(t => t.jiraKey).map(t => t.jiraKey));
      const updated = ts.map(t => {
        if (!t.jiraKey || !byKey.has(t.jiraKey)) return t;
        const incoming = byKey.get(t.jiraKey);
        if (!incoming) return t;
        const next = { ...t };
        // Inbound Jira statuses are PESD1-native (a no-op through the map);
        // the map guards against foreign-project names like Resolved/Done.
        if (incoming.status && mapLegacyStatus(incoming.status) !== t.status)
          next.status = mapLegacyStatus(incoming.status);
        if (incoming.assignee !== undefined && incoming.assignee !== t.assignee)
          next.assignee = incoming.assignee;
        next.jiraSyncState = 'synced';
        next.jiraSyncedAt = data.fetchedAt;
        if (next.status !== t.status || next.assignee !== t.assignee) touched++;
        return next;
      });
      // Auto-create stubs for Jira issues we don't yet have locally
      for (const issue of data.issues) {
        if (!issue.key || knownKeys.has(issue.key)) continue;
        const today = new Date().toISOString().slice(0, 10);
        const createdDay = issue.created ? issue.created.slice(0, 10) : today;
        const updatedDay = issue.updated ? issue.updated.slice(0, 10) : today;
        updated.unshift({
          id: issue.key,
          title: issue.summary || `Jira issue ${issue.key}`,
          category: 'Imported from Jira',
          priority: issue.priority || 'Medium',
          status: issue.status || 'To Do',
          created: createdDay,
          updated: updatedDay,
          description: '(Imported from Jira — open in Atlassian for full details)',
          assignee: issue.assignee || null,
          department: '—',
          shop: '—',
          platforms: [],
          timeline: [
            { date: createdDay, actor: issue.assignee || 'Jira', action: 'Imported from Jira' },
          ],
          messages: [],
          internalNotes: [],
          requester: { name: 'Jira import', email: null },
          jiraKey: issue.key,
          jiraSyncedAt: data.fetchedAt,
          jiraSyncState: 'synced',
          source: 'jira',
        });
        created++;
      }
      return updated;
    });
    if (created > 0) {
      recordAudit('jira.stub_imported', _currentActor, null, { project, count: created });
    }
    return { ...data, reconciled: touched, imported: created };
  } catch {
    return null;
  }
};

// Poll every Jira project mirrored by a visible board; falls back to PESD1
// when the spaces store hasn't hydrated or no board declares a project.
const pollAllJiraProjects = () => {
  const keys = new Set(
    allBoards()
      .map(b => b.jiraProjectKey)
      .filter(Boolean)
  );
  if (!keys.size) keys.add('PESD1');
  keys.forEach(k => pollJira(k));
};

// ─── Issue types + Components (live, with fallback) ──────────────────────────
let JIRA_ISSUE_TYPES = {
  issueTypes: [
    { id: 'fb', name: 'Service Request' },
    { id: 'fb', name: 'Incident' },
    { id: 'fb', name: 'Bug' },
  ],
  source: 'fallback',
};
let JIRA_COMPONENTS = { components: [], source: 'fallback' };
const _typesListeners = new Set();
const _componentsListeners = new Set();
const subscribeIssueTypes = fn => {
  _typesListeners.add(fn);
  return () => _typesListeners.delete(fn);
};
const subscribeComponents = fn => {
  _componentsListeners.add(fn);
  return () => _componentsListeners.delete(fn);
};
const loadIssueTypes = async (project = 'PESD1') => {
  try {
    const res = await fetch(`/api/v1/jira/issue-types?project=${encodeURIComponent(project)}`);
    if (!res.ok) return JIRA_ISSUE_TYPES;
    const data = await res.json();
    JIRA_ISSUE_TYPES = { issueTypes: data.issueTypes || [], source: data.source || 'fallback' };
    _typesListeners.forEach(fn => fn(JIRA_ISSUE_TYPES));
    return JIRA_ISSUE_TYPES;
  } catch {
    return JIRA_ISSUE_TYPES;
  }
};
const loadComponents = async (project = 'PESD1') => {
  try {
    const res = await fetch(`/api/v1/jira/components?project=${encodeURIComponent(project)}`);
    if (!res.ok) return JIRA_COMPONENTS;
    const data = await res.json();
    JIRA_COMPONENTS = { components: data.components || [], source: data.source || 'fallback' };
    _componentsListeners.forEach(fn => fn(JIRA_COMPONENTS));
    return JIRA_COMPONENTS;
  } catch {
    return JIRA_COMPONENTS;
  }
};

// ─── Assignable users (live, with fallback) ───────────────────────────────────
let ASSIGNABLE_USERS = { users: [], source: 'fallback', loadedAt: null };
const _assignableListeners = new Set();
const subscribeAssignable = fn => {
  _assignableListeners.add(fn);
  return () => _assignableListeners.delete(fn);
};
const loadAssignableUsers = async (project = 'PESD1') => {
  try {
    const res = await fetch(`/api/v1/jira/users/assignable?project=${encodeURIComponent(project)}`);
    if (!res.ok) return ASSIGNABLE_USERS;
    const data = await res.json();
    ASSIGNABLE_USERS = {
      users: Array.isArray(data.users) ? data.users : [],
      source: data.source || 'fallback',
      loadedAt: new Date().toISOString(),
    };
    _assignableListeners.forEach(fn => fn(ASSIGNABLE_USERS));
    return ASSIGNABLE_USERS;
  } catch {
    return ASSIGNABLE_USERS;
  }
};
const getAssignableUsers = () => ASSIGNABLE_USERS;

// ─── Webhook event polling (W) ────────────────────────────────────────────────
// Polls /api/v1/events every 5s for webhook-relayed Jira changes. Reconciles
// local tickets keyed on jiraKey. Cheap because BFF buffers events in memory.
let LAST_EVENT_AT = null;
let LAST_WEBHOOK_RECEIVED_AT = null;
const _webhookListeners = new Set();
const subscribeWebhookState = fn => {
  _webhookListeners.add(fn);
  return () => _webhookListeners.delete(fn);
};
const pollWebhookEvents = async () => {
  try {
    const since = LAST_EVENT_AT ? `?since=${encodeURIComponent(LAST_EVENT_AT)}` : '';
    const res = await fetch(`/api/v1/events${since}`);
    if (!res.ok) return null;
    const data = await res.json();
    LAST_EVENT_AT = data.fetchedAt || LAST_EVENT_AT;
    LAST_WEBHOOK_RECEIVED_AT = data.lastWebhookAt || LAST_WEBHOOK_RECEIVED_AT;
    _webhookListeners.forEach(fn => fn({ lastWebhookAt: LAST_WEBHOOK_RECEIVED_AT }));
    if (data.count === 0) return data;
    // Apply each event to local state (only updates, not creates — poll handles creates)
    let touched = 0;
    updateTickets(ts =>
      ts.map(t => {
        if (!t.jiraKey) return t;
        const relevant = data.events.find(e => e.issueKey === t.jiraKey);
        if (!relevant) return t;
        const next = { ...t };
        if (relevant.issueStatus && mapLegacyStatus(relevant.issueStatus) !== t.status)
          next.status = mapLegacyStatus(relevant.issueStatus);
        if (relevant.issueAssignee !== undefined && relevant.issueAssignee !== t.assignee) {
          next.assignee = relevant.issueAssignee;
          next.assigneeEmail = emailForAssignee(relevant.issueAssignee);
        }
        next.jiraSyncedAt = data.fetchedAt;
        next.jiraSyncState = 'synced';
        if (next.status !== t.status || next.assignee !== t.assignee) touched++;
        return next;
      })
    );
    return { ...data, applied: touched };
  } catch {
    return null;
  }
};

// Loads the active Jira workflow from the BFF. Safe to call multiple times.
const loadJiraWorkflow = async (project = 'PESD1') => {
  try {
    const res = await fetch(`/api/v1/jira/statuses?project=${encodeURIComponent(project)}`);
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    if (Array.isArray(data?.statuses) && data.statuses.length > 0) {
      setJiraWorkflow({
        statuses: data.statuses,
        source: data.source || 'fallback',
        note: data.note || null,
      });
      return data;
    }
  } catch {
    /* keep current cache / default */
  }
  return getJiraWorkflow();
};

// localStorage persistence helpers live in src/lib/store.js (imported above).

// ─── Form draft persistence hook ──────────────────────────────────────────────
// Drop-in replacement for useState that mirrors the value to localStorage so a
// half-filled form survives navigating away and back. Drafts are scoped to the
// logged-in user (via _currentActor) and restored silently on mount.
//   const [form, setForm, clearDraft] = usePersistentState('submit', EMPTY_FORM, { omit: ['files'] });
// `options.omit` lists keys that must never be serialised (e.g. File objects,
// which JSON.stringify would turn into {}). Call clearDraft() on a successful
// submit to wipe the stored draft and reset to the initial value.
function usePersistentState(key, initialValue, options = {}) {
  const omit = options.omit || [];
  // Scope per user; _currentActor is set on login (falls back to 'anon').
  const scopedKey = `draft:${_currentActor?.email || 'anon'}:${key}`;
  const computeInitial = () => (typeof initialValue === 'function' ? initialValue() : initialValue);
  const stripOmitted = value => {
    if (!value || typeof value !== 'object' || omit.length === 0) return value;
    const copy = { ...value };
    for (const k of omit) delete copy[k];
    return copy;
  };
  const [value, setValue] = useState(() => {
    const init = computeInitial();
    const saved = loadStore(scopedKey, null);
    // Merge saved over the initial so omitted/new keys always start clean.
    return saved && typeof saved === 'object' && typeof init === 'object'
      ? { ...init, ...saved }
      : saved != null
        ? saved
        : init;
  });
  useEffect(() => {
    saveStore(scopedKey, stripOmitted(value));
  }, [scopedKey, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearDraft = useCallback(() => {
    clearStore(scopedKey);
    setValue(computeInitial());
  }, [scopedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue, clearDraft];
}

// Replace an array's contents in-place so existing references stay valid.
const replaceArrayInPlace = (arr, next) => {
  arr.length = 0;
  for (const x of next) arr.push(x);
};

// ─── Jira workflow React hook ─────────────────────────────────────────────────
function useJiraWorkflow() {
  const [workflow, setWorkflow] = useState(getJiraWorkflow);
  useEffect(() => subscribeJiraWorkflow(setWorkflow), []);
  return workflow;
}

function useAssignableUsers() {
  const [state, setState] = useState(getAssignableUsers);
  useEffect(() => subscribeAssignable(setState), []);
  return state;
}

function useIssueTypes() {
  const [state, setState] = useState(() => JIRA_ISSUE_TYPES);
  useEffect(() => subscribeIssueTypes(setState), []);
  return state;
}

function useComponents() {
  const [state, setState] = useState(() => JIRA_COMPONENTS);
  useEffect(() => subscribeComponents(setState), []);
  return state;
}

function useJiraChangelog(jiraKey) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    if (!jiraKey) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/changelog`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setHistory(Array.isArray(json.history) ? json.history : []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return history;
}

function useJiraCsat(jiraKey, status) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!jiraKey || !DONE_STATUSES.has(status)) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jsm/request/${encodeURIComponent(jiraKey)}/csat`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.available) setData(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey, status]);
  return data;
}

function useJiraWorklog(jiraKey) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!jiraKey) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/worklog`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return data;
}

function useJiraWatchers(jiraKey) {
  const [state, setState] = useState({ watchers: [], watchCount: 0 });
  useEffect(() => {
    if (!jiraKey) {
      setState({ watchers: [], watchCount: 0 });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/watchers`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled)
          setState({ watchers: json.watchers || [], watchCount: json.watchCount || 0 });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return state;
}

function useWebhookState() {
  const [state, setState] = useState({ lastWebhookAt: LAST_WEBHOOK_RECEIVED_AT });
  useEffect(() => subscribeWebhookState(setState), []);
  return state;
}

// Fetches the extended Jira issue (links, attachments, labels, components,
// watcher count, fixVersions, issuetype) once per ticket open. Cached per key.
const _jiraIssueCache = new Map();
function useJiraIssueDetail(jiraKey) {
  const [data, setData] = useState(() => (jiraKey ? _jiraIssueCache.get(jiraKey) || null : null));
  useEffect(() => {
    if (!jiraKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        _jiraIssueCache.set(jiraKey, json);
        setData(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return data;
}

function useJiraSla(jiraKey) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!jiraKey) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/sla`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return data;
}

// ─── GitHub pull requests (via Jira dev-status) ───────────────────────────────
// Jira surfaces linked GitHub PRs on an issue through its dev-status API. The
// BFF normalises that into a flat list; tickets carry a `pullRequests` mock so
// the panel is populated in demo mode (no Jira token) exactly like the rest of
// the Jira surface. Normalised PR shape:
//   { id, number, title, url, repo, status, author:{name,login}, sourceBranch,
//     targetBranch, additions, deletions, changedFiles, commentCount,
//     reviews:[{reviewer,state}], checks:{status,passed,failed,pending,total},
//     lastUpdate }

// PR lifecycle status → presentation (icon, colours, label).
const PR_STATUS_META = {
  OPEN: { icon: '🟢', label: 'Open', bg: 'rgba(22, 163, 74, 0.18)', fg: '#15803D' },
  DRAFT: { icon: '📝', label: 'Draft', bg: 'var(--bg-hover)', fg: 'var(--text-secondary)' },
  MERGED: { icon: '🟣', label: 'Merged', bg: 'rgba(147, 51, 234, 0.14)', fg: '#7E22CE' },
  DECLINED: { icon: '🔴', label: 'Declined', bg: 'rgba(220, 38, 38, 0.18)', fg: '#B91C1C' },
};
const prStatusMeta = status => PR_STATUS_META[status] || PR_STATUS_META.OPEN;

// CI/checks rollup → presentation.
const PR_CHECK_META = {
  success: { icon: '✓', label: 'Checks passing', bg: 'rgba(22, 163, 74, 0.18)', fg: '#15803D' },
  failed: { icon: '✕', label: 'Checks failing', bg: 'rgba(220, 38, 38, 0.18)', fg: '#B91C1C' },
  pending: { icon: '•', label: 'Checks running', bg: 'rgba(245, 158, 11, 0.18)', fg: '#92400E' },
};
const prCheckMeta = status => PR_CHECK_META[status] || null;

// Rolls a PR list up into the counts shown in the panel header + chip.
function prSummary(prs) {
  const list = Array.isArray(prs) ? prs : [];
  return {
    total: list.length,
    open: list.filter(p => p.status === 'OPEN').length,
    draft: list.filter(p => p.status === 'DRAFT').length,
    merged: list.filter(p => p.status === 'MERGED').length,
    declined: list.filter(p => p.status === 'DECLINED').length,
    failing: list.filter(p => p.checks?.status === 'failed').length,
  };
}

// Returns { prs, summary, loading, source }. Uses the ticket's mock PRs as the
// baseline and overlays anything the BFF returns from live Jira dev-status.
function usePullRequests(jiraKey, ticket) {
  const mock = useMemo(
    () => (Array.isArray(ticket?.pullRequests) ? ticket.pullRequests : []),
    [ticket]
  );
  const [prs, setPrs] = useState(mock);
  const [source, setSource] = useState(mock.length ? 'mock' : 'none');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPrs(mock);
    setSource(mock.length ? 'mock' : 'none');
  }, [mock]);
  useEffect(() => {
    if (!jiraKey) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/pull-requests`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.available || !Array.isArray(json.pullRequests)) return;
        setPrs(json.pullRequests);
        setSource('jira');
      } catch {
        /* keep mock */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jiraKey]);
  return { prs, summary: prSummary(prs), loading, source };
}

// "17 days ago" style relative time for the Development panel.
function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

// The single status badge shown next to "N pull requests" — mirrors Jira, which
// surfaces the most-recently-updated PR's state.
function aggregatePrStatus(prs) {
  const list = Array.isArray(prs) ? prs : [];
  if (list.length === 0) return null;
  const latest = list
    .slice()
    .sort((a, b) => new Date(b.lastUpdate || 0) - new Date(a.lastUpdate || 0))[0];
  return latest?.status || 'OPEN';
}

// Rolls a ticket's dev data into the Development-panel summary. Build status is
// derived from PR CI checks (a PR with failing checks = a failing build), so the
// panel and the per-PR checks always agree.
function devSummary(ticket) {
  const prs = Array.isArray(ticket?.pullRequests) ? ticket.pullRequests : [];
  const d = ticket?.development || {};
  const buildsFailing = prs.filter(p => p.checks?.status === 'failed').length;
  const buildsTotal = prs.filter(p => p.checks && p.checks.total > 0).length;
  const buildsPending = prs.filter(p => p.checks?.status === 'pending').length;
  return {
    branches: d.branches ?? 0,
    commits: d.commits ?? 0,
    lastCommitAt: d.lastCommitAt || null,
    prs,
    prCount: prs.length,
    prStatus: aggregatePrStatus(prs),
    prSummary: prSummary(prs),
    builds: {
      failing: buildsFailing,
      pending: buildsPending,
      total: buildsTotal,
      status: buildsFailing > 0 ? 'failing' : buildsPending > 0 ? 'pending' : 'passing',
    },
    hasAny: prs.length > 0 || (d.branches ?? 0) > 0 || (d.commits ?? 0) > 0,
  };
}

// FilePreviewCard, FILE_CATEGORIES, categoryForFile, fileToAttachment, etc.
// are imported from src/components/FilePreviewCard.jsx (top of file).

// Renders combined local + Jira attachments using the shared FilePreviewCard.
// Hidden when there's nothing to show.
function TicketAttachments({ local = [], jira = [] }) {
  const localList = (local || []).map((a, i) => ({
    key: `l-${i}-${a.name}`,
    name: a.name,
    size: a.size,
    type: a.type,
    src: a.dataUrl || null,
    origin: 'local',
  }));
  const jiraList = (jira || []).map(a => ({
    key: `j-${a.id}`,
    name: a.filename,
    size: a.size,
    type: a.mimeType,
    src: a.content,
    origin: 'jira',
  }));
  const all = [...localList, ...jiraList];
  if (all.length === 0) return null;
  return (
    <div style={{ ...S.card, marginBottom: '20px' }}>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        📎 Attachments ({all.length})
        {jiraList.length > 0 && localList.length > 0 && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
            · {localList.length} local · {jiraList.length} from Jira
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '8px',
        }}
      >
        {all.map(a => (
          <FilePreviewCard key={a.key} name={a.name} size={a.size} type={a.type} src={a.src} />
        ))}
      </div>
    </div>
  );
}

// Wraps File[] in blob URLs for live preview during form editing. The URLs
// are revoked when the file list changes so we don't leak memory.
function SubmitFilesPreview({ files, onRemove }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const generated = files.map(f => URL.createObjectURL(f));
    setUrls(generated);
    return () => {
      generated.forEach(u => URL.revokeObjectURL(u));
    };
  }, [files]);
  return (
    <div
      style={{
        marginTop: '12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '8px',
      }}
    >
      {files.map((f, i) => (
        <FilePreviewCard
          key={`${f.name}-${i}-${f.size}`}
          name={f.name}
          size={f.size}
          type={f.type}
          src={urls[i] || null}
          onRemove={() => onRemove(i)}
        />
      ))}
    </div>
  );
}

// ─── Modal focus trap hook ────────────────────────────────────────────────────
// Autofocuses the first focusable child of the ref'd element, traps Tab/Shift+Tab
// inside it, and returns focus to the previously focused element on unmount.
function useModalFocusTrap(ref) {
  useEffect(() => {
    const prev = typeof document !== 'undefined' ? document.activeElement : null;
    const node = ref.current;
    if (!node) return;
    const FOCUSABLE =
      'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE));
    const first = focusables()[0];
    (first || node).focus({ preventScroll: true });
    const onKey = e => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) return;
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    };
  }, [ref]);
}

// ─── Auth (mock mode) ─────────────────────────────────────────────────────────
// Constants + password/session primitives live in src/lib/localAuth.js; the
// dev-only demo accounts in src/mocks/seedUsers.js. When API_ENABLED, real
// authentication happens in src/api/authApi.js against the BFF instead.
let MOCK_USERS = [...DEMO_SEED_USERS];

// ─── Maintenance mode (in-memory toggle) ──────────────────────────────────────
let MAINTENANCE = { active: false, message: '', enabledBy: null, enabledAt: null };
const _maintListeners = new Set();
const subscribeMaintenance = fn => {
  _maintListeners.add(fn);
  return () => _maintListeners.delete(fn);
};
const setMaintenanceMode = (active, message, actor) => {
  MAINTENANCE = active
    ? {
        active: true,
        message: message || 'Scheduled maintenance in progress.',
        enabledBy: actor?.name || 'Admin',
        enabledAt: new Date().toISOString(),
      }
    : { active: false, message: '', enabledBy: null, enabledAt: null };
  saveStore('maintenance', MAINTENANCE);
  _maintListeners.forEach(fn => fn(MAINTENANCE));
  if (actor)
    recordAudit(active ? 'system.maintenance_on' : 'system.maintenance_off', actor, null, {
      message,
    });
};
const getMaintenanceMode = () => MAINTENANCE;

// ─── Audit log (in-memory append-only) ────────────────────────────────────────
// Charter R-10: every admin action is recorded immutably. Entries cannot be
// edited or deleted once written.
// Shared label map — both the Home page activity card and the full Audit
// Log page consume this so a new action code only needs to be added in one
// place. Keys must match the `action` strings passed into recordAudit().
const AUDIT_ACTION_LABELS = {
  'user.create': '➕ User created',
  'user.update': '✏️ User edited',
  'user.promote': '⬆️ Promoted to superadmin',
  'user.demote': '⬇️ Demoted to user',
  'user.role_change': '🎚 Role changed',
  'user.deactivate': '🚫 User deactivated',
  'user.reactivate': '✅ User reactivated',
  'user.force_re_otp': '🔁 Force re-OTP',
  'user.reset_password': '🔑 Password reset',
  'role.create': '🎭 Role created',
  'role.update': '🎭 Role updated',
  'role.delete': '🗑 Role deleted',
  'capability.toggle': '🔧 Capability toggled',
  'admin.view_as': '👁 View-as switched',
  'session.login': '🔓 Login',
  'session.logout': '🔒 Logout',
  'system.maintenance_on': '🛠 Maintenance ON',
  'system.maintenance_off': '🛠 Maintenance OFF',
  'system.rbac_migrated': '⚙️ RBAC migration ran',
  'system.settings_update': '⚙️ Settings updated',
  'ticket.bulk_status': '📋 Bulk status change',
  'ticket.bulk_reassign': '📋 Bulk reassign',
  'ticket.status_change': '📋 Status change',
  'ticket.internal_note': '📝 Internal note',
};
const AUDIT_LOG = [];
let _auditVersion = 0;
const _auditListeners = new Set();
const bumpAudit = () => {
  _auditVersion++;
  _auditListeners.forEach(fn => fn(_auditVersion));
  saveStore('audit', AUDIT_LOG);
};
const subscribeAudit = fn => {
  _auditListeners.add(fn);
  return () => _auditListeners.delete(fn);
};

const recordAudit = (action, actor, target = null, details = null) => {
  AUDIT_LOG.unshift({
    id: 'a' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    action, // e.g. 'user.promote'
    actorEmail: actor?.email || 'unknown',
    actorName: actor?.name || 'Unknown',
    targetType: target?.type || null, // 'user' | 'doc' | 'ticket' | 'system' | null
    targetId: target?.id || null,
    targetLabel: target?.label || null,
    details: details || null,
  });
  bumpAudit();
};
const listAudit = () => AUDIT_LOG.slice();

// Module-level holder so admin API functions can resolve the current actor
// without threading actor through every mutation call.
let _currentActor = null;
const setAuditActor = actor => {
  _currentActor = actor;
};

// ─── Admin user-management API (in-memory) ────────────────────────────────────
// Returns a sanitised list (no password hashes) and emits a version counter
// so React components can re-fetch after mutations.
let _usersVersion = 0;
const _usersListeners = new Set();
const bumpUsers = () => {
  _usersVersion++;
  _usersListeners.forEach(fn => fn(_usersVersion));
  saveStore('users', MOCK_USERS);
};
const subscribeUsers = fn => {
  _usersListeners.add(fn);
  return () => _usersListeners.delete(fn);
};

// Back-fill seed tickets with a requester so existing fixtures show up under
// "My Tickets" for the demo users.
const SEED_REQUESTERS = {
  'TKT-2026-0042': { name: 'Kai Nguyen', email: 'kai.nguyen@pomelo.com' },
  'TKT-2026-0038': { name: 'Kai Nguyen', email: 'kai.nguyen@pomelo.com' },
  'TKT-2026-0031': { name: 'Prim Srisawat', email: 'prim.srisawat@pomelo.com' },
  'TKT-2026-0045': { name: 'Prim Srisawat', email: 'prim.srisawat@pomelo.com' },
  'TKT-2026-0044': { name: 'Kai Nguyen', email: 'kai.nguyen@pomelo.com' },
  'TKT-2026-0043': { name: 'Prim Srisawat', email: 'prim.srisawat@pomelo.com' },
  'TKT-2026-0041': { name: 'Kai Nguyen', email: 'kai.nguyen@pomelo.com' },
  'TKT-2026-0039': { name: 'Prim Srisawat', email: 'prim.srisawat@pomelo.com' },
};
for (const t of MOCK_TICKETS) {
  if (!t.requester) t.requester = SEED_REQUESTERS[t.id] || { name: 'Unknown', email: null };
}

// ─── Hydrate from localStorage at module load ─────────────────────────────────
// Each store is replaced in-place so existing references stay valid.
(() => {
  const storedUsers = loadStore('users', null);
  if (Array.isArray(storedUsers) && storedUsers.length) {
    // Drop users persisted under the removed legacy btoa hash scheme — they
    // can no longer authenticate. If nothing valid remains, keep the seeds.
    const valid = storedUsers.filter(u => u.passwordSalt);
    if (valid.length) MOCK_USERS = valid;
  }
  const storedTickets = loadStore('tickets', null);
  if (Array.isArray(storedTickets) && storedTickets.length) {
    replaceArrayInPlace(MOCK_TICKETS, storedTickets);
  }
  const storedAudit = loadStore('audit', null);
  if (Array.isArray(storedAudit)) {
    replaceArrayInPlace(AUDIT_LOG, storedAudit);
  }
  const storedMaint = loadStore('maintenance', null);
  if (storedMaint && typeof storedMaint === 'object') {
    MAINTENANCE = storedMaint;
  }

  // Migrate any legacy status names (Open / Pending / Closed) on persisted or
  // seed tickets to the canonical board workflow names, and default-fill the
  // board v1 fields so stale persisted data never crashes the new UI.
  for (const t of MOCK_TICKETS) {
    if (t.status && LEGACY_TO_JIRA_STATUS[t.status]) {
      t.status = mapLegacyStatus(t.status);
    }
    t.labels ??= [];
    t.watchers ??= [];
    t.links ??= [];
    t.issueType ??= 'Task';
    t.dueDate ??= null;
    t.problemCategory ??= null;
    t.parentId ??= null;
    t.rank ??= null;
  }
})();

// ─── RBAC runtime registry ────────────────────────────────────────────────────
// Capability definitions + seed role shapes live in `src/rbac.js`. The runtime
// state (current role list, settings overrides) lives here so it can mutate
// MOCK_USERS during migration and call recordAudit on changes — both circular
// concerns we'd hit if the registry moved into the pure rbac module.
let ROLES_REGISTRY = SEED_ROLES.map(r => ({ ...r, capabilities: r.capabilities.slice() }));
let SETTINGS = {
  defaultAssigneeName: DEFAULT_ASSIGNEE.name,
  defaultAssigneeEmail: DEFAULT_ASSIGNEE.email,
};

let _rolesVersion = 0;
const _rolesListeners = new Set();
const bumpRoles = () => {
  _rolesVersion++;
  _rolesListeners.forEach(fn => fn(_rolesVersion));
  saveStore('roles', ROLES_REGISTRY);
};
const subscribeRoles = fn => {
  _rolesListeners.add(fn);
  return () => _rolesListeners.delete(fn);
};

let _settingsVersion = 0;
const _settingsListeners = new Set();
const bumpSettings = () => {
  _settingsVersion++;
  _settingsListeners.forEach(fn => fn(_settingsVersion));
  saveStore('settings', SETTINGS);
};
const subscribeSettings = fn => {
  _settingsListeners.add(fn);
  return () => _settingsListeners.delete(fn);
};

const listRoles = () => ROLES_REGISTRY.slice();
const findRole = roleId => ROLES_REGISTRY.find(r => r.id === roleId) || null;
const getDefaultRoleId = () => ROLES_REGISTRY.find(r => r.isDefault)?.id || DEFAULT_ROLE_ID;
const getSettings = () => ({ ...SETTINGS });
const setSettings = next => {
  SETTINGS = { ...SETTINGS, ...next };
  bumpSettings();
};
const countUsersInRole = roleId =>
  MOCK_USERS.reduce((n, u) => n + (u.roleId === roleId ? 1 : 0), 0);

// Users eligible to be picked as a ticket assignee: anyone whose role grants
// tickets.view_assigned (developers, admins, superadmins by default).
// Returns display names sorted alphabetically.
const listAssignableUsers = () => {
  const eligibleRoleIds = new Set(
    ROLES_REGISTRY.filter(r => r.capabilities.includes('tickets.view_assigned')).map(r => r.id)
  );
  return MOCK_USERS.filter(u => u.active !== false && eligibleRoleIds.has(u.roleId))
    .map(u => ({ name: u.name, email: u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Look up the email for a display name. Used when we have a name string
// (legacy callers, Jira sync) but want to write the canonical assigneeEmail.
const emailForAssignee = name => {
  if (!name) return null;
  const match = MOCK_USERS.find(u => u.name === name);
  return match?.email || null;
};

// ─── Role mutation API ────────────────────────────────────────────────────────
// All mutations bump the registry, persist to localStorage, and emit a
// recordAudit entry. Safety rules live here (not in the page) so any caller —
// including future scripts or tests — gets the same guarantees:
//   * superadmin can never lose capabilities (lockout protection)
//   * isSystem roles cannot be deleted
//   * a role with users cannot be deleted (caller must reassign first)
//   * the current actor cannot demote themselves below `roles.edit` if doing
//     so would leave nobody able to manage roles (last-admin guard).
const slugify = s =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'role';

const createRole = ({ name, label, description, color, capabilities }) => {
  const trimmedLabel = String(label || '').trim();
  const machineName = slugify(name || trimmedLabel);
  if (!trimmedLabel) return { error: 'Role label is required.' };
  if (ROLES_REGISTRY.some(r => r.name === machineName))
    return { error: `A role named "${machineName}" already exists.` };
  const id = 'role_' + machineName + '_' + Date.now().toString(36);
  const caps = Array.isArray(capabilities)
    ? capabilities.filter(c => CAPABILITIES.some(cap => cap.id === c))
    : [];
  const role = {
    id,
    name: machineName,
    label: trimmedLabel,
    description: description || '',
    color: color || '#6366F1',
    isSystem: false,
    isDefault: false,
    capabilities: caps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: _currentActor?.email || null,
  };
  ROLES_REGISTRY = [...ROLES_REGISTRY, role];
  bumpRoles();
  // Server assigns its own role id — refresh the registry so later edits to
  // this role target the server's id, not the optimistic local one.
  if (API_ENABLED) {
    rolesApi
      .createRole({
        label: trimmedLabel,
        description: description || '',
        color: role.color,
        capabilities: caps,
      })
      .then(res => {
        if (res.error) console.warn('[api] backend mirror failed:', res.error);
        else hydrateFromBackend();
      });
  }
  recordAudit(
    'role.create',
    _currentActor,
    { type: 'role', id: role.id, label: role.label },
    { capabilities: caps }
  );
  return role;
};

const isFullCapabilitySet = caps =>
  Array.isArray(caps) && CAPABILITIES.every(c => caps.includes(c.id));

const updateRole = (id, updates) => {
  const role = findRole(id);
  if (!role) return { error: 'Role not found.' };
  // Lockout protection: superadmin must keep every capability.
  if (
    role.id === 'role_superadmin' &&
    updates.capabilities &&
    !isFullCapabilitySet(updates.capabilities)
  ) {
    return { error: 'Superadmin must retain every capability.' };
  }
  const next = { ...role, ...updates, updatedAt: new Date().toISOString() };
  // System roles keep their machine `name` even if the label is renamed.
  if (role.isSystem) next.name = role.name;
  ROLES_REGISTRY = ROLES_REGISTRY.map(r => (r.id === id ? next : r));
  bumpRoles();
  {
    const { label, description, color, capabilities } = updates;
    const serverPatch = Object.fromEntries(
      Object.entries({ label, description, color, capabilities }).filter(([, v]) => v !== undefined)
    );
    mirror(Object.keys(serverPatch).length && rolesApi.updateRole(id, serverPatch));
  }
  const capChange = updates.capabilities
    ? {
        added: updates.capabilities.filter(c => !role.capabilities.includes(c)),
        removed: role.capabilities.filter(c => !updates.capabilities.includes(c)),
      }
    : null;
  recordAudit(
    'role.update',
    _currentActor,
    { type: 'role', id, label: next.label },
    { changedKeys: Object.keys(updates), ...(capChange ? { capabilities: capChange } : {}) }
  );
  if (capChange && (capChange.added.length || capChange.removed.length)) {
    recordAudit(
      'capability.toggle',
      _currentActor,
      { type: 'role', id, label: next.label },
      capChange
    );
  }
  return next;
};

const deleteRole = id => {
  const role = findRole(id);
  if (!role) return { error: 'Role not found.' };
  if (role.isSystem) return { error: 'System roles cannot be deleted.' };
  if (countUsersInRole(id) > 0) return { error: 'Reassign users in this role before deleting it.' };
  ROLES_REGISTRY = ROLES_REGISTRY.filter(r => r.id !== id);
  bumpRoles();
  mirror(rolesApi.deleteRole(id));
  recordAudit('role.delete', _currentActor, { type: 'role', id, label: role.label });
  return { ok: true };
};

// Move a user to a different role. The plan calls this `roles.assign`.
// Last-admin guard: if the actor would lose `roles.edit` by reassigning
// themselves AND no other user holds it, the call is rejected.
const setUserRoleId = (userId, nextRoleId) => {
  const u = findUserById(userId);
  if (!u) return { error: 'User not found.' };
  const targetRole = findRole(nextRoleId);
  if (!targetRole) return { error: 'Target role not found.' };
  if (u.roleId === nextRoleId) return sanitiseUser(u);

  // Last-admin guard
  if (
    _currentActor &&
    u.email === _currentActor.email &&
    !targetRole.capabilities.includes('roles.edit')
  ) {
    const othersCanEditRoles = MOCK_USERS.some(other => {
      if (other.id === u.id) return false;
      const r = findRole(other.roleId);
      return r && r.capabilities.includes('roles.edit');
    });
    if (!othersCanEditRoles)
      return { error: 'Cannot demote yourself — nobody else can manage roles.' };
  }

  const prev = u.roleId;
  u.roleId = nextRoleId;
  // Keep the legacy role string in step for components that still read it.
  if (targetRole.name === 'superadmin' || targetRole.name === 'user') u.role = targetRole.name;
  else u.role = targetRole.name;
  bumpUsers();
  mirror(usersApi.updateUser(userId, { roleId: nextRoleId }));
  recordAudit(
    'user.role_change',
    _currentActor,
    { type: 'user', id: u.id, label: u.name },
    { from: prev, to: nextRoleId }
  );
  return sanitiseUser(u);
};

const updateSettings = patch => {
  setSettings(patch);
  recordAudit(
    'system.settings_update',
    _currentActor,
    { type: 'system', id: 'settings', label: 'Portal settings' },
    patch
  );
  return getSettings();
};

// ─── One-shot RBAC migration ──────────────────────────────────────────────────
// Runs at boot when the persisted schema version is older than the current.
// Idempotent: rerunning is a no-op. Handles three jobs:
//   1. Load persisted roles + settings if present; else use seeds.
//   2. Rewrite legacy seed emails (Quenton: gmail → pomelofashion). Collision
//      guard: if the new email already exists, log + skip to avoid a duplicate.
//   3. Back-fill `roleId` on persisted users whose only role marker is the
//      legacy `role` string.
(() => {
  const storedRoles = loadStore('roles', null);
  if (Array.isArray(storedRoles) && storedRoles.length) {
    ROLES_REGISTRY = storedRoles;
  } else {
    saveStore('roles', ROLES_REGISTRY);
  }
  const storedSettings = loadStore('settings', null);
  if (storedSettings && typeof storedSettings === 'object') {
    SETTINGS = { ...SETTINGS, ...storedSettings };
  } else {
    saveStore('settings', SETTINGS);
  }

  const storedVersion = loadStore('userRolesV', 0);
  if (storedVersion >= RBAC_SCHEMA_VERSION) return;

  let touched = false;

  for (const [oldEmail, newEmail] of Object.entries(SEED_EMAIL_REWRITE)) {
    const oldUser = MOCK_USERS.find(u => u.email === oldEmail);
    if (!oldUser) continue;
    const collision = MOCK_USERS.find(u => u.email === newEmail && u.id !== oldUser.id);
    if (collision) {
      console.warn(
        `[rbac migration] skipping email rewrite ${oldEmail} → ${newEmail}: target email already exists on user ${collision.id}`
      );
      continue;
    }
    oldUser.email = newEmail;
    touched = true;
  }

  for (const u of MOCK_USERS) {
    if (u.roleId) continue;
    const mapped = LEGACY_ROLE_TO_ROLE_ID[u.role] || getDefaultRoleId();
    u.roleId = mapped;
    touched = true;
  }

  if (touched) bumpUsers();
  saveStore('userRolesV', RBAC_SCHEMA_VERSION);
  recordAudit(
    'system.rbac_migrated',
    { name: 'System', email: 'system@pomelo.local' },
    { type: 'system', id: 'rbac', label: 'RBAC schema' },
    { from: storedVersion, to: RBAC_SCHEMA_VERSION }
  );
})();

const sanitiseUser = ({ passwordHash: _, ...u }) => u;
const listUsers = () => MOCK_USERS.map(sanitiseUser);
const findUserById = id => MOCK_USERS.find(u => u.id === id);

// ─── Backend hydration (API mode) ─────────────────────────────────────────────
// After login the server becomes the source of truth: replace the local
// roles/users/tickets caches with server state. Non-admins get a 403 from
// /api/users — their cache simply keeps whatever the session already knows.
const userFromApi = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: findRole(u.roleId)?.name || 'user', // legacy string some components read
  roleId: u.roleId,
  department: u.department,
  avatarUrl: u.avatarUrl || null,
  active: u.active,
  lastLoginAt: u.lastLoginAt,
  forceReOtp: false,
  createdAt: u.createdAt,
});

const hydrateFromBackend = async () => {
  if (!API_ENABLED) return;
  // Roles first so userFromApi can resolve role names.
  const r = await rolesApi.listRoles();
  if (r.data?.roles?.length) {
    ROLES_REGISTRY = r.data.roles;
    bumpRoles();
  }
  const [u, t, sp] = await Promise.all([
    usersApi.listUsers(),
    ticketsApi.listTickets({ limit: 200 }),
    spacesApi.listSpaces(),
  ]);
  if (u.data?.users) {
    MOCK_USERS = u.data.users.map(userFromApi);
    bumpUsers();
  }
  if (t.data?.tickets) updateTickets(t.data.tickets.map(ticketFromApi));
  if (sp.data?.spaces) setSpaces(sp.data.spaces);
};

const updateUser = (id, updates) => {
  const u = findUserById(id);
  if (!u) return null;
  const before = { ...u };
  Object.assign(u, updates);
  bumpUsers();
  const { name, email, department } = updates;
  const serverPatch = Object.fromEntries(
    Object.entries({ name, email, department }).filter(([, v]) => v !== undefined)
  );
  mirror(Object.keys(serverPatch).length && usersApi.updateUser(id, serverPatch));
  recordAudit(
    'user.update',
    _currentActor,
    { type: 'user', id: u.id, label: u.name },
    {
      changedKeys: Object.keys(updates),
      before: Object.fromEntries(Object.keys(updates).map(k => [k, before[k]])),
      after: updates,
    }
  );
  return sanitiseUser(u);
};

const setUserRole = (id, role) => {
  const u = findUserById(id);
  if (!u) return null;
  const prev = u.role;
  u.role = role;
  bumpUsers();
  mirror(
    LEGACY_ROLE_TO_ROLE_ID[role] &&
      usersApi.updateUser(id, { roleId: LEGACY_ROLE_TO_ROLE_ID[role] })
  );
  recordAudit(
    role === 'superadmin' ? 'user.promote' : 'user.demote',
    _currentActor,
    { type: 'user', id: u.id, label: u.name },
    { from: prev, to: role }
  );
  return sanitiseUser(u);
};

const setUserActive = (id, active) => {
  const u = findUserById(id);
  if (!u) return null;
  u.active = active;
  bumpUsers();
  mirror(usersApi.updateUser(id, { active }));
  recordAudit(active ? 'user.reactivate' : 'user.deactivate', _currentActor, {
    type: 'user',
    id: u.id,
    label: u.name,
  });
  return sanitiseUser(u);
};

const forceUserReOtp = id => {
  const u = findUserById(id);
  if (!u) return null;
  u.forceReOtp = true;
  bumpUsers();
  recordAudit('user.force_re_otp', _currentActor, { type: 'user', id: u.id, label: u.name });
  return sanitiseUser(u);
};

const resetUserPassword = async (id, tempPassword) => {
  const u = findUserById(id);
  if (!u) return null;
  await setUserPassword(u, tempPassword);
  u.forceReOtp = true;
  bumpUsers();
  recordAudit('user.reset_password', _currentActor, { type: 'user', id: u.id, label: u.name });
  return sanitiseUser(u);
};

const adminCreateUser = async ({
  name,
  email,
  role,
  roleId,
  department = 'IT & Technology',
  tempPassword,
}) => {
  const sanitisedEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!sanitisedEmail || !name) return { error: 'Name and email are required.' };
  if (MOCK_USERS.some(u => u.email === sanitisedEmail)) return { error: 'Email already in use.' };
  if (!tempPassword || tempPassword.length < 8)
    return { error: 'Temp password must be at least 8 characters.' };
  // Resolve the target role. Callers can pass roleId directly (new API used
  // by Roles & Access page) or the legacy `role` string (existing Users
  // panel CreateUserModal). Falls back to the registry's default role.
  const resolvedRoleId =
    roleId || (role ? LEGACY_ROLE_TO_ROLE_ID[role] || getDefaultRoleId() : getDefaultRoleId());
  const targetRole = findRole(resolvedRoleId);
  const legacyRoleStr = targetRole?.name || role || 'user';
  const id = 'u' + Date.now();
  const u = {
    id,
    name: name.trim(),
    email: sanitisedEmail,
    passwordHash: '',
    passwordSalt: '',
    role: legacyRoleStr,
    roleId: resolvedRoleId,
    department,
    active: true,
    lastLoginAt: null,
    forceReOtp: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  await setUserPassword(u, tempPassword);
  MOCK_USERS.push(u);
  bumpUsers();
  mirror(
    usersApi.createUser({
      name: u.name,
      email: sanitisedEmail,
      password: tempPassword,
      roleId: resolvedRoleId,
      department,
    })
  );
  recordAudit(
    'user.create',
    _currentActor,
    { type: 'user', id, label: u.name },
    { role: legacyRoleStr, roleId: resolvedRoleId, department }
  );
  return { user: sanitiseUser(u) };
};

const delay = ms => new Promise(res => setTimeout(res, ms));

// ─── Mock-mode credential wrappers ────────────────────────────────────────────
// Primitives come from src/lib/localAuth.js; these wrappers own the MOCK_USERS
// list and the persistence bump. The legacy reversible btoa hash scheme is
// gone — all mock users are salted SHA-256.
const validateCredentials = async (email, password) => {
  const { user, deactivated } = await localValidateCredentials(MOCK_USERS, email, password);
  if (deactivated) return { _deactivated: true };
  return user;
};

const createSession = user => {
  const { passwordHash: _, ...safe } = user;
  // Record lastLoginAt on the canonical record so the admin Users panel reflects it
  const canonical = MOCK_USERS.find(u => u.id === user.id);
  if (canonical) {
    canonical.lastLoginAt = new Date().toISOString();
    bumpUsers();
  }
  writeSession(safe);
};

const registerUser = async (firstName, lastName, email, password) => {
  const sanitisedEmail = email.trim().toLowerCase();
  if (MOCK_USERS.some(u => u.email === sanitisedEmail))
    return 'An account with this email already exists.';
  const id = 'u' + Date.now();
  const u = {
    id,
    name: firstName.trim() + ' ' + lastName.trim(),
    email: sanitisedEmail,
    passwordHash: '',
    passwordSalt: '',
    role: 'user',
    department: 'IT & Technology',
    active: true,
    lastLoginAt: null,
    forceReOtp: false,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  await setUserPassword(u, password);
  MOCK_USERS.push(u);
  bumpUsers();
  return null;
};

// ─── Signup Modal ─────────────────────────────────────────────────────────────
function SignupModal({ onClose, onToast }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const passwordScore = password
    ? [
        password.length >= 8,
        /[A-Z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password),
      ].filter(Boolean).length
    : 0;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8 || passwordScore < 2) {
      setError('Password must be at least 8 characters and rated Fair or stronger.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    let registrationError;
    if (API_ENABLED) {
      // Backend signup requires email verification before first login.
      const { error: err } = await authApi.register(
        `${firstName.trim()} ${lastName.trim()}`,
        email.trim().toLowerCase(),
        password
      );
      registrationError = err;
    } else {
      await delay(AUTH_DELAY);
      registrationError = await registerUser(firstName, lastName, email, password);
    }
    setIsLoading(false);
    if (registrationError) {
      setError(registrationError);
      return;
    }
    onToast?.(
      API_ENABLED
        ? 'Account created — check your email to verify your address before signing in.'
        : 'Welcome To Pomelo TechOps Portal'
    );
    onClose();
  };

  const fieldStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '8px',
    border: '1.5px solid var(--border-default)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    color: 'var(--text-primary)',
    background: 'var(--bg-page)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };
  const pwFieldStyle = { ...fieldStyle, paddingRight: '44px' };
  const focusOrange = e => {
    e.target.style.borderColor = 'var(--accent-primary)';
  };
  const blurGray = e => {
    e.target.style.borderColor = 'var(--border-default)';
  };

  const Lbl = ({ children }) => (
    <div
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '6px',
      }}
    >
      {children}
    </div>
  );
  const Eye = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '16px',
        lineHeight: 1,
        padding: '4px',
      }}
    >
      {show ? '🙈' : '👁'}
    </button>
  );
  const Spin = () => (
    <span
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        display: 'inline-block',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create your account"
        style={{
          width: '460px',
          maxWidth: '95vw',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--bg-branded)',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#fff',
              fontSize: '18px',
              fontWeight: 900,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Create your account
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.65)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}
        >
          {/* First + Last Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <Lbl>First Name</Lbl>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First"
                aria-label="First name"
                autoComplete="given-name"
                style={fieldStyle}
                onFocus={focusOrange}
                onBlur={blurGray}
              />
            </div>
            <div>
              <Lbl>Last Name</Lbl>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last"
                aria-label="Last name"
                autoComplete="family-name"
                style={fieldStyle}
                onFocus={focusOrange}
                onBlur={blurGray}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <Lbl>Email</Lbl>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@pomelo.com"
              aria-label="Email"
              autoComplete="email"
              style={fieldStyle}
              onFocus={focusOrange}
              onBlur={blurGray}
            />
          </div>

          {/* Password */}
          <div>
            <Lbl>Password</Lbl>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-label="Password"
                autoComplete="new-password"
                style={pwFieldStyle}
                onFocus={focusOrange}
                onBlur={blurGray}
              />
              <Eye show={showPassword} onToggle={() => setShowPassword(v => !v)} />
            </div>
            <PasswordStrengthMeter password={password} />
          </div>

          {/* Confirm Password */}
          <div>
            <Lbl>Confirm Password</Lbl>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                aria-label="Confirm password"
                autoComplete="new-password"
                style={pwFieldStyle}
                onFocus={focusOrange}
                onBlur={blurGray}
              />
              <Eye show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(220, 38, 38, 0.10)',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ⚠ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '13px 0',
              background: isLoading ? 'var(--border-strong)' : 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 900,
              fontSize: '15px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.15s',
            }}
          >
            {isLoading ? <Spin /> : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Password Strength Meter ───────────────────────────────────────────────────
function PasswordStrengthMeter({ password }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#DC2626', '#EA580C', '#CA8A04', '#16A34A'];
  const color = colors[score - 1] || colors[0];
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: i < score ? color : 'var(--border-default)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: '11px', color, textAlign: 'right', fontWeight: 700 }}>
        Password strength: {labels[score - 1] || 'Too short'}
      </div>
    </div>
  );
}

// ─── OTP Input ────────────────────────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  // useRef must not be called inside a loop or array method — store all 6
  // element refs in a single ref object to satisfy the Rules of Hooks.
  const refs = useRef([]);
  const [focusedIdx, setFocusedIdx] = useState(null);

  const handleChange = (idx, raw) => {
    const digit = raw.replace(/[^0-9]/g, '').slice(-1);
    const next = [...value];
    next[idx] = digit;
    onChange(next);
    if (digit && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      const next = [...value];
      next[idx - 1] = '';
      onChange(next);
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = e => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^0-9]/g, '')
      .slice(0, 6);
    const next = Array(6).fill('');
    pasted.split('').forEach((d, i) => {
      next[i] = d;
    });
    onChange(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '20px 0' }}>
      {value.map((v, i) => (
        <input
          key={i}
          ref={el => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={v}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={() => {
            setFocusedIdx(i);
            refs.current[i]?.select();
          }}
          onBlur={() => setFocusedIdx(null)}
          style={{
            width: '48px',
            height: '56px',
            textAlign: 'center',
            fontSize: '24px',
            fontWeight: 900,
            border: `2px solid ${focusedIdx === i ? 'var(--accent-primary)' : 'var(--border-default)'}`,
            borderRadius: '10px',
            outline: 'none',
            fontFamily: "'Inter', sans-serif",
            color: 'var(--text-primary)',
            background: 'var(--bg-page)',
            transition: 'border-color 0.15s',
          }}
        />
      ))}
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
// ─── Email-link actions (path deep links: /reset, /accept-invite) ─────────────
// Rendered instead of the login page when the URL carries a token from a
// transactional email. /verify needs no form and is consumed by the shell.
function TokenActionPage({ link, onDone, onToast }) {
  const isInvite = link.kind === 'accept-invite';
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (isInvite && !name.trim()) return setError('Please enter your name.');
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setBusy(true);
    const res = isInvite
      ? await authApi.acceptInvite(link.token, name.trim(), pw)
      : await authApi.resetPassword(link.token, pw);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (isInvite) {
      onToast?.('Welcome aboard — your account is ready.');
      onDone(res.data || null); // the server already opened the session
    } else {
      onToast?.('Password updated — sign in with your new password.');
      onDone(null);
    }
  };

  const field = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '8px',
    border: '1.5px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: "'Inter', sans-serif",
    boxSizing: 'border-box',
  };
  const label = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        fontFamily: "'Inter', sans-serif",
        padding: '24px',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {isInvite ? 'Accept your invite' : 'Set a new password'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {isInvite
              ? 'Finish setting up your TechOps Portal account.'
              : 'Choose a new password for your TechOps Portal account.'}
          </div>
        </div>
        {isInvite && (
          <div>
            <label style={label}>Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={field} autoFocus />
          </div>
        )}
        <div>
          <label style={label}>{isInvite ? 'Password' : 'New password'}</label>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            style={field}
            autoFocus={!isInvite}
          />
        </div>
        <div>
          <label style={label}>Confirm password</label>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} style={field} />
        </div>
        {error && (
          <div style={{ fontSize: '13px', color: '#DC2626', fontWeight: 600 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-primary)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '14px',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {busy ? 'Working…' : isInvite ? 'Create account' : 'Update password'}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}

function LoginPage({ onLogin, onToast }) {
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockState, setLockStateLocal] = useState(() => getLockState());
  const [countdown, setCountdown] = useState(0);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpValue, setOtpValue] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfPass, setShowConfPass] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showSignup, setShowSignup] = useState(false);

  const isLocked = lockState.lockedUntil > Date.now();

  // Pre-fill from remember me
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (!lockState.lockedUntil || lockState.lockedUntil <= Date.now()) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockState.lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCountdown(0);
        clearLockState();
        setLockStateLocal({ attempts: 0, lockedUntil: 0 });
        clearInterval(tick);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
    setCountdown(Math.ceil((lockState.lockedUntil - Date.now()) / 1000));
    return () => clearInterval(tick);
  }, [lockState.lockedUntil]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleLogin = async e => {
    e.preventDefault();
    if (isLocked || isLoading) return;
    setIsLoading(true);
    setError('');
    const sanitised = email.trim().toLowerCase();
    let user,
      apiError = null;
    if (API_ENABLED) {
      // Real session: httpOnly cookie set by the BFF. The server enforces
      // its own rate limits; the local lockout below still slows brute force
      // in the UI. Server role is an object — flatten to the legacy string.
      const res = await authApi.login(sanitised, password);
      user = res.data ? { ...res.data, role: res.data.role?.name || 'user' } : null;
      apiError = res.error;
    } else {
      await delay(AUTH_DELAY);
      user = await validateCredentials(sanitised, password);
    }
    if (!user) {
      const current = getLockState();
      const newAttempts = current.attempts + 1;
      const lockedUntil = newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
      setLockState(newAttempts, lockedUntil);
      setLockStateLocal({ attempts: newAttempts, lockedUntil });
      setError(apiError || 'Invalid email or password');
      setIsLoading(false);
      return;
    }
    if (user._deactivated) {
      setError('Your account has been deactivated. Please contact an administrator.');
      setIsLoading(false);
      return;
    }
    clearLockState();
    if (rememberMe) localStorage.setItem(REMEMBER_KEY, sanitised);
    else localStorage.removeItem(REMEMBER_KEY);
    if (!API_ENABLED) createSession(user);
    setIsLoading(false);
    onLogin(user);
  };

  const handleSendCode = async e => {
    e.preventDefault();
    setForgotEmail(forgotEmail || email);
    setIsLoading(true);
    await delay(AUTH_DELAY);
    setIsLoading(false);
    setView('forgot-code');
    setResendCooldown(30);
  };

  const handleVerifyCode = async e => {
    e.preventDefault();
    const code = otpValue.join('');
    if (code.length < 6) {
      setOtpError('Please enter all 6 digits');
      return;
    }
    setIsLoading(true);
    setOtpError('');
    await delay(AUTH_DELAY);
    setIsLoading(false);
    setView('forgot-password');
  };

  const handleResetPassword = async e => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setResetError('');
    await delay(AUTH_DELAY);
    setIsLoading(false);
    onToast?.('Password reset! Sign in with your new password.');
    setView('login');
    setNewPassword('');
    setConfirmPassword('');
    setOtpValue(['', '', '', '', '', '']);
  };

  const resetToLogin = () => {
    setView('login');
    setError('');
    setOtpError('');
    setResetError('');
    setForgotEmail('');
    setOtpValue(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmPassword('');
  };

  const Spinner = () => (
    <span
      style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        display: 'inline-block',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );

  const EyeToggle = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '16px',
        lineHeight: 1,
        padding: '4px',
      }}
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? '🙈' : '👁'}
    </button>
  );

  const ErrorBanner = ({ msg }) =>
    msg ? (
      <div
        style={{
          marginTop: '14px',
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(220, 38, 38, 0.10)',
          border: '1px solid #FCA5A5',
          color: '#DC2626',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        ⚠ {msg}
      </div>
    ) : null;

  const BackLink = ({ onClick }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--accent-primary)',
        fontWeight: 700,
        fontSize: '13px',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '24px',
      }}
    >
      ← Back to sign in
    </button>
  );

  const submitBtnStyle = disabled => ({
    width: '100%',
    padding: '13px',
    background: disabled ? 'var(--border-strong)' : 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    fontSize: '15px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.15s',
    marginTop: '8px',
  });

  const Label = ({ children }) => (
    <div
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '6px',
      }}
    >
      {children}
    </div>
  );

  const renderRight = () => {
    if (view === 'login')
      return (
        <div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Welcome back 👋
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
            Sign in to your TechOps account
          </p>
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <Label>Email</Label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@pomelo.com"
                aria-label="Email"
                autoComplete="email"
                disabled={isLocked || isLoading}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  background: isLocked ? 'var(--bg-hover)' : 'var(--bg-page)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <div>
              <Label>Password</Label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-label="Password"
                  autoComplete="current-password"
                  disabled={isLocked || isLoading}
                  style={{
                    width: '100%',
                    padding: '11px 44px 11px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border-default)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    background: isLocked ? 'var(--bg-hover)' : 'var(--bg-page)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
                <EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '2px 0',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setView('forgot-email')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={isLocked || isLoading}
              style={submitBtnStyle(isLocked || isLoading)}
            >
              {isLoading ? <Spinner /> : 'Sign In'}
            </button>
            <ErrorBanner msg={error} />
            {isLocked && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(220, 38, 38, 0.10)',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                🔒 Too many attempts. Try again in <strong>{countdown}s</strong>
              </div>
            )}
          </form>
          <p
            style={{
              textAlign: 'center',
              marginTop: '20px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
            }}
          >
            {"Don't have an account? "}
            <button
              type="button"
              onClick={() => setShowSignup(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Sign up
            </button>
          </p>
        </div>
      );

    if (view === 'forgot-email')
      return (
        <div>
          <BackLink onClick={resetToLogin} />
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Forgot your password?
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
            {"We'll send a 6-digit code to your email."}
          </p>
          <form
            onSubmit={handleSendCode}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <Label>Email</Label>
              <input
                type="email"
                value={forgotEmail || email}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="you@pomelo.com"
                aria-label="Email"
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border-default)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-page)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <button type="submit" disabled={isLoading} style={submitBtnStyle(isLoading)}>
              {isLoading ? <Spinner /> : 'Send Reset Code'}
            </button>
          </form>
        </div>
      );

    if (view === 'forgot-code')
      return (
        <div>
          <BackLink onClick={resetToLogin} />
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Check your email
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Enter the 6-digit code sent to <strong>{forgotEmail || email}</strong>
          </p>
          <form onSubmit={handleVerifyCode}>
            <OtpInput value={otpValue} onChange={setOtpValue} />
            <ErrorBanner msg={otpError} />
            <button type="submit" disabled={isLoading} style={submitBtnStyle(isLoading)}>
              {isLoading ? <Spinner /> : 'Verify Code'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px' }}>
            {resendCooldown > 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>Resend code in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={() => setResendCooldown(30)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Resend code
              </button>
            )}
          </div>
        </div>
      );

    if (view === 'forgot-password')
      return (
        <div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Create new password
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
            Choose a strong password for your account.
          </p>
          <form
            onSubmit={handleResetPassword}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div>
              <Label>New Password</Label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-label="New password"
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '11px 44px 11px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border-default)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-page)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
                <EyeToggle show={showNewPass} onToggle={() => setShowNewPass(v => !v)} />
              </div>
              <PasswordStrengthMeter password={newPassword} />
            </div>
            <div>
              <Label>Confirm Password</Label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-label="Confirm new password"
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '11px 44px 11px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border-default)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-page)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent-primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
                <EyeToggle show={showConfPass} onToggle={() => setShowConfPass(v => !v)} />
              </div>
            </div>
            <ErrorBanner msg={resetError} />
            <button type="submit" disabled={isLoading} style={submitBtnStyle(isLoading)}>
              {isLoading ? <Spinner /> : 'Reset Password'}
            </button>
          </form>
        </div>
      );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        @media (max-width: 640px) { .login-left { display: none !important; } .login-right { padding: 32px 24px !important; } }
      `}</style>

      {/* Left panel — hidden on mobile via .login-left media query */}
      <div
        className="login-left"
        style={{
          width: '42%',
          background: 'var(--bg-branded)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '44px 52px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 12px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            right: '-80px',
            width: '320px',
            height: '320px',
            borderRadius: '50%',
            background: 'rgba(124,58,237,0.08)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '-60px',
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.03)',
            pointerEvents: 'none',
          }}
        />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{ color: '#fff', fontWeight: 900, fontSize: '22px', letterSpacing: '-0.01em' }}
          >
            Pomelo
          </div>
          <div
            style={{
              color: 'var(--accent-primary)',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: '1px',
            }}
          >
            TechOps Portal
          </div>
        </div>

        {/* Center content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1
            style={{
              color: '#fff',
              fontSize: '30px',
              fontWeight: 900,
              lineHeight: 1.25,
              marginBottom: '32px',
            }}
          >
            IT Support,
            <br />
            built for Pomelo teams
          </h1>
          {[
            { icon: '🎟', text: 'Submit & track IT tickets' },
            { icon: '📚', text: 'Access IT documentation' },
            { icon: '🛠', text: 'Powerful admin tools' },
          ].map(f => (
            <div
              key={f.text}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}
            >
              <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{f.icon}</span>
              <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: '15px' }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            color: 'rgba(255,255,255,0.35)',
            fontSize: '12px',
          }}
        >
          🔒 Internal use only · Pomelo Technology
        </div>
      </div>

      {/* Right panel — scroll-safe vertical centering: margin:auto keeps the form
          centered when it fits, and overflowY:auto lets shorter viewports scroll
          to the bottom CTA ("Sign up") instead of clipping it. */}
      <div
        className="login-right"
        style={{
          flex: 1,
          background: 'var(--bg-surface)',
          display: 'flex',
          overflowY: 'auto',
          padding: '48px 40px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px', margin: 'auto' }}>{renderRight()}</div>
      </div>

      {showSignup && <SignupModal onClose={() => setShowSignup(false)} onToast={onToast} />}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
// type: 'success' | 'error' | 'info'
function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const variants = {
    success: { bg: 'var(--bg-branded)', icon: '✅', title: 'Done!' },
    error: { bg: '#DC2626', icon: '❌', title: 'Something went wrong' },
    info: { bg: '#0369A1', icon: 'ℹ️', title: 'Note' },
  };
  const v = variants[type] || variants.success;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        zIndex: 9999,
        background: v.bg,
        color: '#fff',
        padding: '14px 22px',
        borderRadius: '12px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        animation: 'slideUp 0.3s ease',
        maxWidth: '380px',
        fontFamily: "'Inter', sans-serif",
      }}
      role="status"
      aria-live="polite"
    >
      <span style={{ fontSize: '20px' }}>{v.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>{v.title}</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)', wordBreak: 'break-word' }}>
          {message}
        </div>
      </div>
      <button
        onClick={onDone}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '0 0 0 4px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Priority Suggester ───────────────────────────────────────────────────────
function PrioritySuggester({ onSelect }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);

  const questions = [
    'Is this completely blocking your work right now?',
    'Are multiple people affected by this issue?',
    'Is there a workaround available?',
  ];

  const suggest = ans => {
    const all = [...answers, ans];
    if (all.length < 3) {
      setAnswers(all);
      setStep(step + 1);
    } else {
      const blocked = all[0];
      const multi = all[1];
      const noWorkaround = !all[2];
      let priority = 'Low';
      if (blocked && multi && noWorkaround) priority = 'Critical';
      else if (blocked && noWorkaround) priority = 'High';
      else if (blocked || (multi && noWorkaround)) priority = 'Medium';
      onSelect(priority);
    }
  };

  const reset = () => {
    setStep(0);
    setAnswers([]);
  };

  return (
    <div
      style={{
        background: 'var(--accent-soft)',
        border: '1.5px solid #BFDBFE',
        borderRadius: '10px',
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>🧠</span> Smart Priority Suggester
        {step > 0 && (
          <button
            onClick={reset}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Reset
          </button>
        )}
      </div>
      {step < 3 ? (
        <>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Q{step + 1}: {questions[step]}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => suggest(true)}
              style={{ ...S.orangeBtn, padding: '7px 18px', fontSize: '13px' }}
            >
              Yes
            </button>
            <button onClick={() => suggest(false)} style={{ ...S.ghostBtn }}>
              No
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Answer all 3 questions first.
        </div>
      )}
    </div>
  );
}

// ─── Status dropdown (Jira-style) ────────────────────────────────────────────
// Colored status pill that opens the full board workflow grouped by category,
// exactly like Jira's transition button. Renders a read-only pill when the
// viewer cannot change status.
function StatusDropdown({ status, onChange, disabled }) {
  const color = statusColorFor(status);
  const pill = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 12px',
        borderRadius: '6px',
        background: STATUS_BG[color] || 'var(--bg-hover)',
        color,
        fontSize: '13px',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
      {!disabled && <ChevronDown size={14} />}
    </span>
  );
  if (disabled) return pill;
  const groups = [
    { label: 'Not started', items: BOARD_COLUMNS.filter(c => c.category === 'new') },
    { label: 'In flight', items: BOARD_COLUMNS.filter(c => c.category === 'indeterminate') },
    { label: 'Done', items: BOARD_COLUMNS.filter(c => c.category === 'done') },
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Change status"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {pill}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          style={{ ...radixMenuContentStyle, minWidth: '240px' }}
          sideOffset={6}
          align="start"
        >
          {groups.map(g => (
            <div key={g.label}>
              <div
                style={{
                  padding: '6px 10px 4px',
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                {g.label}
              </div>
              {g.items.map(c => (
                <DropdownMenu.Item
                  key={c.name}
                  onSelect={() => c.name !== status && onChange(c.name)}
                  style={{
                    ...radixMenuItemStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: c.name === status ? 800 : 500,
                  }}
                >
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      background: c.color,
                      flexShrink: 0,
                    }}
                  />
                  {c.name}
                  {c.name === status && <Check size={13} style={{ marginLeft: 'auto' }} />}
                </DropdownMenu.Item>
              ))}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Ticket Detail ────────────────────────────────────────────────────────────
// Highlight @Name spans for names actually mentioned on the message.
// Pure string split — React escapes everything; no HTML surface.
function renderWithMentions(text, mentions) {
  if (!mentions || mentions.length === 0) return text;
  const names = mentions.map(m => m.name).filter(Boolean);
  if (!names.length) return text;
  const re = new RegExp(
    `(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'g'
  );
  return String(text)
    .split(re)
    .map((part, i) =>
      part.startsWith('@') && names.includes(part.slice(1)) ? (
        <span key={i} style={{ fontWeight: 800, textDecoration: 'underline' }}>
          {part}
        </span>
      ) : (
        part
      )
    );
}

function TicketDetail({
  ticket,
  onBack,
  onStatusChange,
  onAssigneeChange,
  onAddNotification,
  onOpenTicket,
  currentUser,
}) {
  const can = useCan();
  const isAssignedToMe =
    !!currentUser?.email && !!ticket.assigneeEmail && ticket.assigneeEmail === currentUser.email;
  const canViewAll = can('tickets.view_all');
  const canInternalNotes = can('tickets.internal_notes');
  const isRequester =
    !!currentUser?.email && ticket.requester?.email?.toLowerCase() === currentUser.email;
  const isSuperadminRole = currentUser?.roleId === 'role_superadmin';
  const canChangeStatus =
    can('tickets.status_change_any') || (isAssignedToMe && can('tickets.status_change_own'));
  const canDeleteTicket = can('tickets.delete');
  // Field edits mirror the server's PATCH rule: staff or the assignee.
  const canEditFields = canViewAll || isAssignedToMe;
  // Full post-creation editing of every field (incl. requester, department,
  // shop, platforms) is admin-only — gated by the tickets.edit_all capability.
  const canEditAll = can('tickets.edit_all');
  const [confirmDel, setConfirmDel] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [messages, setMessages] = useState(ticket.messages);
  const [internalNotes, setInternalNotes] = useState(ticket.internalNotes || []);
  const [newNote, setNewNote] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [linkRelation, setLinkRelation] = useState('relates to');
  const [linkTarget, setLinkTarget] = useState('');
  const messagesEndRef = useRef(null);

  // Conversation privacy: the server's conversationHidden flag is the truth;
  // until the detail fetch lands (and in mock mode) mirror its rule locally —
  // requester + current assignee + superadmins only.
  const [convoHidden, setConvoHidden] = useState(
    API_ENABLED ? !(isSuperadminRole || isRequester || isAssignedToMe) : false
  );
  const [mentionable, setMentionable] = useState([]);
  const [mentionChips, setMentionChips] = useState([]); // [{name,email}] picked this draft
  const [mentionQuery, setMentionQuery] = useState(null); // {token} | null

  // Hydrate the persisted conversation + internal notes (the list endpoint
  // carries no comments) and stamp the caller's read cursor.
  useEffect(() => {
    if (!API_ENABLED || !ticket.uuid) return;
    let cancelled = false;
    ticketsApi.getTicket(ticket.uuid).then(res => {
      if (cancelled || !res.data) return;
      const full = ticketFromApi(res.data);
      setConvoHidden(!!full.conversationHidden);
      // Server rows replace the seed; keep local rows still awaiting their ack.
      setMessages(prev => [...full.messages, ...prev.filter(m => !m.id && m.synced === false)]);
      setInternalNotes(full.internalNotes);
      mirror(ticketsApi.markTicketRead(ticket.uuid));
    });
    ticketsApi.getMentionable(ticket.uuid).then(res => {
      if (!cancelled && res.data?.users) setMentionable(res.data.users);
    });
    return () => {
      cancelled = true;
    };
  }, [ticket.uuid]);

  // '@token' at the end of the draft opens the mention dropdown.
  const handleComposerChange = value => {
    setNewMsg(value);
    const m = value.match(/(^|\s)@([\w .-]{0,30})$/);
    setMentionQuery(m ? { token: m[2] } : null);
  };
  const mentionMatches = mentionQuery
    ? mentionable
        .filter(u => u.name.toLowerCase().includes(mentionQuery.token.toLowerCase()))
        .slice(0, 6)
    : [];
  const pickMention = u => {
    setNewMsg(v => v.replace(/(^|\s)@([\w .-]{0,30})$/, `$1@${u.name} `));
    setMentionChips(prev =>
      prev.some(m => m.email === u.email) ? prev : [...prev, { name: u.name, email: u.email }]
    );
    setMentionQuery(null);
  };

  const subtasks = MOCK_TICKETS.filter(t => t.parentId === ticket.id);
  const parentTicket = ticket.parentId ? MOCK_TICKETS.find(t => t.id === ticket.parentId) : null;

  const addSubtask = title => {
    const today = new Date().toISOString().slice(0, 10);
    const id = `TKT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const sub = {
      id,
      title,
      category: ticket.category,
      priority: 'Medium',
      status: 'To Do',
      created: today,
      updated: today,
      description: '',
      assignee: null,
      assigneeEmail: null,
      requester: { name: currentUser?.name || 'Unknown', email: currentUser?.email || null },
      department: ticket.department,
      shop: ticket.shop,
      platforms: [],
      labels: [],
      dueDate: null,
      issueType: 'Sub-task',
      watchers: [],
      parentId: ticket.id,
      timeline: [
        {
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          action: `Created as subtask of ${ticket.id}`,
          actor: currentUser?.name || 'You',
        },
      ],
      messages: [],
      pullRequests: [],
      jiraSyncState: 'local-only',
    };
    addTicket(sub);
    if (API_ENABLED && ticket.uuid) {
      ticketsApi
        .createTicket({
          title,
          description: '',
          priority: 'Medium',
          platforms: [],
          labels: [],
          issueType: 'Sub-task',
          parentId: ticket.uuid,
        })
        .then(res => {
          if (res.error) return console.warn('[api] backend mirror failed:', res.error);
          updateTickets(ts =>
            ts.map(x =>
              x.id === id ? { ...x, id: res.data.key, key: res.data.key, uuid: res.data.id } : x
            )
          );
        });
    }
    recordAudit('ticket.subtask_create', _currentActor, {
      type: 'ticket',
      id: ticket.id,
      label: ticket.title,
    });
  };

  // Local links are written to BOTH tickets (canonical + inverse label) so
  // each side renders its own view; the server stores one row and derives
  // the inverse (server linkId is stashed for mirrored deletes).
  const LINK_INVERSE = {
    blocks: 'is blocked by',
    clones: 'is cloned by',
    duplicates: 'is duplicated by',
    'relates to': 'relates to',
  };

  const addTicketLink = (otherId, relation) => {
    const other = MOCK_TICKETS.find(t => t.id === otherId);
    if (!other) return;
    const linkId = 'lnk' + Date.now();
    updateTickets(ts =>
      ts.map(t => {
        if (t.id === ticket.id)
          return { ...t, links: [...(t.links || []), { id: linkId, otherId, relation }] };
        if (t.id === otherId)
          return {
            ...t,
            links: [
              ...(t.links || []),
              { id: linkId, otherId: ticket.id, relation: LINK_INVERSE[relation] || relation },
            ],
          };
        return t;
      })
    );
    if (API_ENABLED && ticket.uuid && other.uuid) {
      ticketsApi.addLink(ticket.uuid, other.uuid, relation).then(res => {
        if (res.error) return console.warn('[api] backend mirror failed:', res.error);
        updateTickets(ts =>
          ts.map(t => ({
            ...t,
            links: (t.links || []).map(l =>
              l.id === linkId ? { ...l, serverId: res.data.linkId } : l
            ),
          }))
        );
      });
    }
    recordAudit(
      'ticket.link',
      _currentActor,
      { type: 'ticket', id: ticket.id, label: ticket.title },
      { otherId, relation }
    );
  };

  const removeTicketLink = linkId => {
    const link = (ticket.links || []).find(l => l.id === linkId);
    updateTickets(ts =>
      ts.map(t => ({ ...t, links: (t.links || []).filter(l => l.id !== linkId) }))
    );
    mirror(ticket.uuid && link?.serverId && ticketsApi.removeLink(ticket.uuid, link.serverId));
  };

  // Patch pinned fields: optimistic local update + backend mirror. The parent
  // re-derives `ticket` from the store on the next bump, so the UI refreshes.
  const patchTicket = fields => {
    updateTickets(ts =>
      ts.map(t =>
        t.id === ticket.id ? { ...t, ...fields, updated: new Date().toISOString().slice(0, 10) } : t
      )
    );
    mirror(ticket.uuid && ticketsApi.updateTicket(ticket.uuid, fields));
    recordAudit(
      'ticket.update',
      _currentActor,
      { type: 'ticket', id: ticket.id, label: ticket.title },
      { changedKeys: Object.keys(fields) }
    );
  };

  // Requester lives as a nested { name, email } object locally but as two flat
  // columns server-side, so it can't ride patchTicket's spread. Admin-only.
  const patchRequester = ({ name, email }) => {
    const nextName = name !== undefined ? name : ticket.requester?.name || '';
    const nextEmail = email !== undefined ? email : ticket.requester?.email || '';
    updateTickets(ts =>
      ts.map(t =>
        t.id === ticket.id
          ? {
              ...t,
              requester: { name: nextName, email: nextEmail },
              updated: new Date().toISOString().slice(0, 10),
            }
          : t
      )
    );
    mirror(
      ticket.uuid &&
        ticketsApi.updateTicket(ticket.uuid, {
          requesterName: nextName,
          requesterEmail: nextEmail,
        })
    );
    recordAudit(
      'ticket.update',
      _currentActor,
      { type: 'ticket', id: ticket.id, label: ticket.title },
      { changedKeys: ['requester'] }
    );
  };

  // Watch/unwatch is self-service, so it mirrors to the dedicated
  // /watchers/me endpoints rather than the capability-gated PATCH.
  const myEmail = currentUser?.email || null;
  const watching = !!myEmail && (ticket.watchers || []).includes(myEmail);
  const toggleWatch = () => {
    if (!myEmail) return;
    updateTickets(ts =>
      ts.map(t =>
        t.id === ticket.id
          ? {
              ...t,
              watchers: watching
                ? (t.watchers || []).filter(w => w !== myEmail)
                : [...(t.watchers || []), myEmail],
            }
          : t
      )
    );
    mirror(
      ticket.uuid &&
        (watching ? ticketsApi.unwatchTicket(ticket.uuid) : ticketsApi.watchTicket(ticket.uuid))
    );
  };
  const jiraDetail = useJiraIssueDetail(ticket?.jiraKey);
  const jiraSla = useJiraSla(ticket?.jiraKey);
  const jiraChangelog = useJiraChangelog(ticket?.jiraKey);
  const jiraWatchers = useJiraWatchers(ticket?.jiraKey);
  const jiraCsat = useJiraCsat(ticket?.jiraKey, ticket?.status);
  const jiraWorklog = useJiraWorklog(ticket?.jiraKey);

  // Context about the assignee (department + workload) — shown to anyone with
  // full ticket visibility, not just superadmins.
  const assigneeContext = useMemo(() => {
    if (!canViewAll || !ticket.assignee) return null;
    const u = MOCK_USERS.find(u => u.name === ticket.assignee);
    const open = MOCK_TICKETS.filter(
      t => t.assignee === ticket.assignee && statusCategoryFor(t.status) !== 'done'
    ).length;
    const total = MOCK_TICKETS.filter(t => t.assignee === ticket.assignee).length;
    return { dept: u?.department || 'Unknown', email: u?.email || null, open, total };
  }, [canViewAll, ticket.assignee]);

  const addInternalNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const note = {
      id: 'n' + Date.now(),
      author: 'You',
      ts: new Date().toISOString(),
      text,
    };
    setInternalNotes(prev => [...prev, note]);
    if (!ticket.internalNotes) ticket.internalNotes = [];
    ticket.internalNotes.push(note);
    bumpTickets();
    // Persist — internal notes survive reloads now (admin tier only).
    mirror(ticket.uuid && ticketsApi.addComment(ticket.uuid, text, { internal: true }));
    setNewNote('');
    recordAudit('ticket.internal_note', _currentActor, {
      type: 'ticket',
      id: ticket.id,
      label: ticket.title,
    });
  };

  const sendMsg = async () => {
    if (!newMsg.trim()) return;
    const text = newMsg.trim();
    // A mention chip only counts while its @Name still appears in the text.
    const activeMentions = mentionChips.filter(m => text.includes(`@${m.name}`));
    const localMsg = {
      from: _currentActor?.name || 'You',
      authorEmail: currentUser?.email || null,
      time: new Date().toISOString().slice(0, 16).replace('T', ' '),
      text,
      mentions: activeMentions,
      synced: false,
    };
    setMessages(prev => [...prev, localMsg]);
    setNewMsg('');
    onAddNotification?.({
      type: 'ticket_message',
      title: `New message on ${ticket.id}`,
      body: text,
      actorName: _currentActor?.name || 'You',
      ticketId: ticket.id,
    });

    // Persist the comment to the backend when this ticket is a server row;
    // re-stamp the read cursor so our own message doesn't look unread.
    mirror(
      ticket.uuid &&
        ticketsApi.addComment(ticket.uuid, text, { mentions: activeMentions }).then(res => {
          if (!res?.error) mirror(ticket.uuid && ticketsApi.markTicketRead(ticket.uuid));
          return res;
        })
    );
    setMentionChips([]);
    setMentionQuery(null);

    // Fire-and-forget push to Jira when the ticket is linked
    if (ticket.jiraKey) {
      try {
        const res = await fetch('/api/v1/jira/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: ticket.jiraKey, body: text, author: _currentActor?.name }),
        });
        if (res.ok) {
          setMessages(prev => prev.map(m => (m === localMsg ? { ...m, synced: true } : m)));
          recordAudit(
            'ticket.jira_comment',
            _currentActor,
            { type: 'ticket', id: ticket.id, label: ticket.title },
            { jiraKey: ticket.jiraKey }
          );
        } else {
          recordAudit(
            'ticket.jira_comment_failed',
            _currentActor,
            { type: 'ticket', id: ticket.id, label: ticket.title },
            { jiraKey: ticket.jiraKey, status: res.status }
          );
        }
      } catch {
        /* keep local-only */
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // On open, if this ticket is linked to Jira, pull any newer comments.
  // Gated on conversation access — the Jira thread IS the conversation.
  useEffect(() => {
    if (!ticket?.jiraKey || convoHidden) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/jira/issue/${encodeURIComponent(ticket.jiraKey)}/comments`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.comments)) return;
        // Merge any Jira comments not already in our local thread (match by body+author)
        setMessages(prev => {
          const known = new Set(prev.map(m => `${m.from}|${m.text}`));
          const additions = data.comments
            .filter(
              c =>
                !known.has(
                  `${c.author}|${c.body.replace(/^\[Posted via TechOps Portal by [^\]]+\]\n/, '')}`
                )
            )
            .map(c => ({
              from: c.author,
              time: c.created ? c.created.slice(0, 16).replace('T', ' ') : '',
              text: c.body,
              synced: true,
              fromJira: true,
            }));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket?.jiraKey, convoHidden]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-primary)',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ← Back
        </button>
        {myEmail && (
          <button
            onClick={toggleWatch}
            title={watching ? 'Stop watching this ticket' : 'Watch this ticket'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              border: watching
                ? '1px solid var(--accent-primary)'
                : '1px solid var(--border-default)',
              cursor: 'pointer',
              background: watching ? 'var(--accent-soft)' : 'var(--bg-surface)',
              color: watching ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              marginLeft: 'auto',
              marginRight: '10px',
            }}
          >
            <Eye size={14} />
            {watching ? 'Watching' : 'Watch'}
            {(ticket.watchers?.length || 0) + (jiraWatchers?.watchCount || 0) > 0 &&
              ` · ${(ticket.watchers?.length || 0) + (jiraWatchers?.watchCount || 0)}`}
          </button>
        )}
        {API_ENABLED && ticket.uuid && can('problems.manage') && (
          <button
            onClick={async () => {
              const { data, error } = await createProblemFromTicket(ticket.uuid);
              onAddNotification?.({
                type: 'status_change',
                title: error ? `Problem creation failed` : `Problem ${data.key} opened`,
                body: error || `Root-cause record created from ${ticket.id}.`,
                actorName: currentUser?.name || 'You',
              });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              marginRight: '10px',
            }}
          >
            <SearchCheck size={14} /> Create problem
          </button>
        )}
        {canDeleteTicket &&
          (confirmDel ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#DC2626', fontWeight: 700 }}>
                Delete this ticket permanently?
              </span>
              <button
                onClick={() => {
                  deleteTicket(ticket.id);
                  onAddNotification?.({
                    type: 'ticket_deleted',
                    title: `Ticket deleted: ${ticket.title}`,
                    body: `${currentUser?.name || 'A staff member'} deleted ${ticket.id}.`,
                    actorName: currentUser?.name || 'You',
                  });
                  onBack();
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: '#DC2626',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '7px',
                border: '1px solid #FCA5A5',
                cursor: 'pointer',
                background: 'transparent',
                color: '#DC2626',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              <Trash2 size={14} /> Delete ticket
            </button>
          ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            {ticket.id}
          </div>
          {canEditAll ? (
            <input
              key={`title-${ticket.id}`}
              defaultValue={ticket.title}
              aria-label="Ticket title"
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== ticket.title) patchTicket({ title: v });
                else e.target.value = ticket.title;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') {
                  e.target.value = ticket.title;
                  e.target.blur();
                }
              }}
              style={{
                fontSize: '22px',
                fontWeight: 900,
                color: 'var(--text-primary)',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: '6px',
                padding: '2px 6px',
                margin: '-2px -6px',
                width: '100%',
                minWidth: '320px',
                outline: 'none',
              }}
              onFocus={e => {
                e.target.style.border = '1px solid var(--border-default)';
                e.target.style.background = 'var(--bg-page)';
              }}
            />
          ) : (
            <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-primary)' }}>
              {ticket.title}
            </div>
          )}
          {(assigneeContext || ticket.requester) && (
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {canViewAll && ticket.requester && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    borderRadius: '100px',
                    border: '1px solid #BFDBFE',
                    fontSize: '11px',
                    color: '#1E3A8A',
                    fontWeight: 600,
                  }}
                >
                  🙋 Submitted by <strong>{ticket.requester.name}</strong>
                  {ticket.requester.email ? <> · {ticket.requester.email}</> : null}
                </div>
              )}
              {assigneeContext && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    background: 'var(--accent-soft)',
                    borderRadius: '100px',
                    border: '1px solid #C4B5FD',
                    fontSize: '11px',
                    color: 'var(--accent-primary)',
                    fontWeight: 600,
                  }}
                >
                  👤 Assigned to <strong>{ticket.assignee}</strong> · {assigneeContext.dept} ·{' '}
                  {assigneeContext.open} open / {assigneeContext.total} total
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={S.badge(PRIORITY_COLORS[ticket.priority])}>{ticket.priority}</span>
          <span style={S.badge(STATUS_COLORS[ticket.status])}>{ticket.status}</span>
        </div>
      </div>

      {/* Approval requests on this ticket (catalog approval-gated types) */}
      {API_ENABLED && ticket.uuid && (
        <ApprovalPanel
          subjectType="ticket"
          subjectId={ticket.uuid}
          currentUser={currentUser}
          canOverride={can('approvals.override')}
        />
      )}

      {/* JSM SLA cycles (Jira-authoritative) */}
      {jiraSla?.available && Array.isArray(jiraSla.cycles) && jiraSla.cycles.length > 0 && (
        <div style={{ ...S.card, marginBottom: '20px', borderLeft: '4px solid #3B82F6' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            SLA (from Jira Service Management)
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {jiraSla.cycles.map(c => (
              <div
                key={c.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  fontSize: '13px',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                {c.paused && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                    }}
                  >
                    ⏸ Paused
                  </span>
                )}
                {c.breached ? (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(220, 38, 38, 0.18)',
                      color: '#B91C1C',
                      fontWeight: 700,
                    }}
                  >
                    🔴 Breached
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(22, 163, 74, 0.18)',
                      color: '#15803D',
                      fontWeight: 700,
                    }}
                  >
                    🟢 On track
                  </span>
                )}
                {c.remainingTime && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Remaining: {c.remainingTime}
                  </span>
                )}
                {c.elapsedTime && (
                  <span style={{ color: 'var(--text-muted)' }}>Elapsed: {c.elapsedTime}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked Jira issues */}
      {jiraDetail?.links && jiraDetail.links.length > 0 && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            🔗 Linked issues
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {jiraDetail.links.map(l => (
              <a
                key={`${l.key}-${l.direction}`}
                href={`https://pomelofashion.atlassian.net/browse/${l.key}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  background: 'var(--bg-page)',
                  borderRadius: '7px',
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: 'var(--border-default)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {l.label || l.type}
                </span>
                <span style={{ fontSize: '12px', color: '#1D4ED8', fontWeight: 700 }}>{l.key}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>
                  {l.summary}
                </span>
                {l.status && (
                  <span style={{ ...S.badge(statusColorFor(l.status)), fontSize: '10px' }}>
                    {l.status}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Development panel — branches, commits, PRs, build status (Jira-style) */}
      <DevelopmentPanel ticket={ticket} />

      {/* CSAT (resolved tickets only) */}
      {jiraCsat?.available && jiraCsat.rating != null && (
        <div
          style={{
            ...S.card,
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Customer satisfaction
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '20px' }}>
            {Array.from({ length: jiraCsat.max || 5 }).map((_, i) => (
              <span
                key={i}
                style={{ color: i < jiraCsat.rating ? '#F59E0B' : 'var(--border-default)' }}
              >
                ★
              </span>
            ))}
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontWeight: 700,
                marginLeft: '4px',
              }}
            >
              {jiraCsat.rating}/{jiraCsat.max || 5}
            </span>
          </div>
          {jiraCsat.comment && (
            <div
              style={{
                flex: 1,
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
              }}
            >
              "{jiraCsat.comment}"
            </div>
          )}
        </div>
      )}

      {/* Worklog summary */}
      {jiraWorklog && jiraWorklog.totalSeconds > 0 && canViewAll && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              ⏱ Time logged ({Math.round(jiraWorklog.totalSeconds / 360) / 10}h total)
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {jiraWorklog.entries.length} entries
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {jiraWorklog.totals.map(t => (
              <span
                key={t.author}
                style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '4px',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                }}
              >
                {t.author}: {t.hours}h
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Watchers */}
      {ticket?.jiraKey && jiraWatchers.watchCount > 0 && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            👁 Watchers ({jiraWatchers.watchCount})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {jiraWatchers.watchers.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Watcher list requires elevated Jira permissions.
              </span>
            ) : (
              jiraWatchers.watchers.map(w => (
                <span
                  key={w.accountId}
                  style={{
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '100px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#1E3A8A',
                    fontWeight: 600,
                  }}
                >
                  {w.displayName}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {/* Jira issue metadata badges */}
      {jiraDetail &&
        (jiraDetail.issueType ||
          jiraDetail.labels.length > 0 ||
          jiraDetail.components.length > 0 ||
          jiraDetail.fixVersions.length > 0) && (
          <div
            style={{
              ...S.card,
              marginBottom: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            {jiraDetail.issueType && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '4px',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  fontWeight: 700,
                }}
              >
                📋 {jiraDetail.issueType}
              </span>
            )}
            {jiraDetail.components.map(c => (
              <span
                key={c.id}
                style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '4px',
                  background: '#ECFCCB',
                  color: '#3F6212',
                  fontWeight: 700,
                }}
              >
                🧩 {c.name}
              </span>
            ))}
            {jiraDetail.labels.map(l => (
              <span
                key={l}
                style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '100px',
                  background: 'rgba(147, 51, 234, 0.08)',
                  color: '#6B21A8',
                  fontWeight: 600,
                }}
              >
                #{l}
              </span>
            ))}
            {jiraDetail.fixVersions.map(v => (
              <span
                key={v}
                style={{
                  fontSize: '11px',
                  padding: '3px 9px',
                  borderRadius: '4px',
                  background: 'rgba(234, 88, 12, 0.10)',
                  color: 'var(--accent-primary)',
                  fontWeight: 700,
                }}
              >
                🏷 fixVersion: {v}
              </span>
            ))}
          </div>
        )}

      {/* Attachments — merges locally-persisted files (with data URLs for in-tab
          preview) and Jira-side attachments (linked at their Jira content URLs). */}
      <TicketAttachments local={ticket.attachments} jira={jiraDetail?.attachments} />

      {canInternalNotes && (
        <div style={{ ...S.card, marginBottom: '20px', borderLeft: '4px solid #FBBF24' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Internal notes
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#92400E',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Admin only
            </span>
          </div>
          {internalNotes.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              {internalNotes.map(n => (
                <div
                  key={n.id}
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(245, 158, 11, 0.10)',
                    borderRadius: '8px',
                    border: '1px solid #FDE68A',
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {n.text}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {n.author} · {new Date(n.ts).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addInternalNote();
              }}
              placeholder="Leave a note other admins will see…"
              aria-label="Add internal note"
              style={{
                flex: 1,
                padding: '9px 14px',
                border: '1.5px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={addInternalNote}
              disabled={!newNote.trim()}
              style={{
                padding: '9px 16px',
                background: newNote.trim() ? 'var(--bg-branded)' : 'var(--border-default)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: newNote.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add note
            </button>
          </div>
        </div>
      )}

      {/* Status (Jira-style transition control) */}
      <div style={{ ...S.card, marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Status
            </div>
            <StatusDropdown
              status={ticket.status}
              disabled={!canChangeStatus}
              onChange={s => onStatusChange(ticket.id, s)}
            />
          </div>
          {!canChangeStatus && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              🔒 Status updates are managed by the IT team.
            </div>
          )}
        </div>
      </div>

      {/* Subtasks */}
      {(subtasks.length > 0 || canEditFields) && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '12px',
            }}
          >
            Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subtasks.map(st => (
              <div
                key={st.id}
                onClick={() => onOpenTicket?.(st.id)}
                role={onOpenTicket ? 'button' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-page)',
                  cursor: onOpenTicket ? 'pointer' : 'default',
                }}
              >
                <Network size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {st.id}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st.title}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '100px',
                    color: statusColorFor(st.status),
                    background: STATUS_BG[statusColorFor(st.status)] || 'var(--bg-hover)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st.status}
                </span>
              </div>
            ))}
            {canEditFields && (
              <input
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSubtask.trim()) {
                    addSubtask(newSubtask.trim());
                    setNewSubtask('');
                  }
                }}
                placeholder="+ Add subtask (press Enter)"
                aria-label="Add subtask"
                style={{ ...S.input, fontSize: '13px' }}
              />
            )}
          </div>
        </div>
      )}

      {/* Linked work items (local tickets; Jira-side links render separately) */}
      {((ticket.links || []).length > 0 || canViewAll) && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '12px',
            }}
          >
            Linked work items
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(ticket.links || []).map(link => {
              const other = MOCK_TICKETS.find(t => t.id === link.otherId);
              if (!other) return null;
              return (
                <div
                  key={link.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-page)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontStyle: 'italic',
                      color: 'var(--text-muted)',
                      minWidth: '92px',
                    }}
                  >
                    {link.relation}
                  </span>
                  <span
                    onClick={() => onOpenTicket?.(other.id)}
                    role={onOpenTicket ? 'button' : undefined}
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      cursor: onOpenTicket ? 'pointer' : 'default',
                    }}
                  >
                    {other.id}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {other.title}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '100px',
                      color: statusColorFor(other.status),
                      background: STATUS_BG[statusColorFor(other.status)] || 'var(--bg-hover)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {other.status}
                  </span>
                  {canViewAll && (
                    <button
                      onClick={() => removeTicketLink(link.id)}
                      aria-label="Remove link"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {canViewAll && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={linkRelation}
                  onChange={e => setLinkRelation(e.target.value)}
                  aria-label="Link relation"
                  style={{
                    ...S.select,
                    width: 'auto',
                    fontSize: '12px',
                    padding: '6px 26px 6px 8px',
                  }}
                >
                  {['blocks', 'clones', 'duplicates', 'relates to'].map(r => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <select
                  value={linkTarget}
                  onChange={e => setLinkTarget(e.target.value)}
                  aria-label="Link target ticket"
                  style={{ ...S.select, flex: 1, fontSize: '12px', padding: '6px 26px 6px 8px' }}
                >
                  <option value="">Select a ticket…</option>
                  {MOCK_TICKETS.filter(
                    t => t.id !== ticket.id && !(ticket.links || []).some(l => l.otherId === t.id)
                  ).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.id} — {t.title.slice(0, 60)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (linkTarget) {
                      addTicketLink(linkTarget, linkRelation);
                      setLinkTarget('');
                    }
                  }}
                  style={{ ...S.ghostBtn, fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  Add link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        {/* Timeline — merges local actions + Jira changelog when ticket is linked */}
        <div style={S.card}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '14px',
            }}
          >
            Activity Timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(() => {
              const localEntries = (ticket.timeline || []).map((t, i) => ({
                key: `l-${i}`,
                when: t.date,
                actor: t.actor,
                action: t.action,
                source: 'local',
              }));
              const jiraEntries = (jiraChangelog || []).flatMap(h =>
                h.changes.map((c, idx) => ({
                  key: `j-${h.id}-${idx}`,
                  when: h.created,
                  actor: h.author,
                  action: `${c.field}: ${c.from || '—'} → ${c.to || '—'}`,
                  source: 'jira',
                }))
              );
              const merged = [...localEntries, ...jiraEntries].sort((a, b) =>
                String(b.when).localeCompare(String(a.when))
              );
              return merged.map((t, i) => (
                <div key={t.key} style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: t.source === 'jira' ? '#1D4ED8' : 'var(--accent-primary)',
                        flexShrink: 0,
                        marginTop: '3px',
                      }}
                    />
                    {i < merged.length - 1 && (
                      <div
                        style={{
                          width: '1px',
                          flex: 1,
                          background: 'var(--border-default)',
                          marginTop: '4px',
                        }}
                      />
                    )}
                  </div>
                  <div style={{ paddingBottom: '8px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {t.action}{' '}
                      {t.source === 'jira' && (
                        <span style={{ fontSize: '10px', color: '#1D4ED8', fontWeight: 700 }}>
                          · Jira
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {String(t.when).slice(0, 16).replace('T', ' ')} · {t.actor}
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Details */}
        <div style={S.card}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: '14px',
            }}
          >
            Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Assignee</span>
              {can('tickets.assign') ? (
                <div style={{ position: 'relative' }}>
                  <select
                    value={ticket.assignee || ''}
                    onChange={e => onAssigneeChange(ticket.id, e.target.value || null)}
                    style={{
                      ...S.select,
                      width: 'auto',
                      padding: '3px 24px 3px 8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Unassigned</option>
                    {listAssignableUsers().map(a => (
                      <option key={a.email} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {ticket.assignee || 'Unassigned'}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: canEditAll ? 'flex-start' : 'center',
                gap: '10px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  paddingTop: canEditAll ? '4px' : 0,
                }}
              >
                Reporter
              </span>
              {canEditAll ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    alignItems: 'flex-end',
                  }}
                >
                  <input
                    key={`reqname-${ticket.id}`}
                    defaultValue={ticket.requester?.name || ''}
                    aria-label="Reporter name"
                    placeholder="Name"
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v !== (ticket.requester?.name || '')) patchRequester({ name: v });
                    }}
                    style={S.inlineEdit}
                  />
                  <input
                    key={`reqemail-${ticket.id}`}
                    defaultValue={ticket.requester?.email || ''}
                    aria-label="Reporter email"
                    placeholder="email@pomelo.com"
                    type="email"
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v !== (ticket.requester?.email || '')) patchRequester({ email: v });
                    }}
                    style={{ ...S.inlineEdit, fontWeight: 400 }}
                  />
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {ticket.requester?.name || '—'}
                </span>
              )}
            </div>

            {/* Labels — chip editor for staff/assignee, chips otherwise */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                Labels
              </span>
              <span
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                {(ticket.labels || []).map(l => {
                  const { bg, fg } = labelColorFor(l);
                  return (
                    <span
                      key={l}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: bg,
                        color: fg,
                      }}
                    >
                      {l}
                      {canEditFields && (
                        <button
                          onClick={() =>
                            patchTicket({ labels: ticket.labels.filter(x => x !== l) })
                          }
                          aria-label={`Remove label ${l}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: fg,
                            padding: 0,
                            fontSize: '10px',
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
                {canEditFields && (
                  <input
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const l = labelInput.trim().toUpperCase();
                        if (l && !(ticket.labels || []).includes(l)) {
                          patchTicket({ labels: [...(ticket.labels || []), l] });
                        }
                        setLabelInput('');
                      }
                    }}
                    placeholder="+ label"
                    aria-label="Add label"
                    style={{
                      width: '76px',
                      padding: '3px 6px',
                      borderRadius: '5px',
                      border: '1px dashed var(--border-default)',
                      background: 'transparent',
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                )}
                {!canEditFields && (ticket.labels || []).length === 0 && (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>—</span>
                )}
              </span>
            </div>

            {/* Due date */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Due date</span>
              {canEditFields ? (
                <input
                  type="date"
                  value={ticket.dueDate || ''}
                  onChange={e => patchTicket({ dueDate: e.target.value || null })}
                  aria-label="Due date"
                  style={{
                    padding: '2px 6px',
                    borderRadius: '5px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-page)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                />
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {ticket.dueDate || '—'}
                </span>
              )}
            </div>

            {/* Problem category */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Problem Category
              </span>
              {canEditFields ? (
                <select
                  value={ticket.problemCategory || ''}
                  onChange={e => patchTicket({ problemCategory: e.target.value || null })}
                  aria-label="Problem category"
                  style={{
                    ...S.select,
                    width: 'auto',
                    padding: '3px 24px 3px 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  <option value="">None</option>
                  {PROBLEM_CATEGORIES.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {ticket.problemCategory || '—'}
                </span>
              )}
            </div>

            {/* Issue type */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Type</span>
              {canEditFields ? (
                <select
                  value={ticket.issueType || 'Task'}
                  onChange={e => patchTicket({ issueType: e.target.value })}
                  aria-label="Issue type"
                  style={{
                    ...S.select,
                    width: 'auto',
                    padding: '3px 24px 3px 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {ISSUE_TYPES.map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {ticket.issueType || 'Task'}
                </span>
              )}
            </div>

            {parentTicket && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Parent</span>
                <span
                  onClick={() => onOpenTicket?.(parentTicket.id)}
                  role={onOpenTicket ? 'button' : undefined}
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--accent-primary)',
                    cursor: onOpenTicket ? 'pointer' : 'default',
                  }}
                >
                  <Network size={12} style={{ verticalAlign: '-2px' }} /> {parentTicket.id}
                </span>
              </div>
            )}

            {/* Category / Priority / Department / Shop / Platforms — inline
                editable for admins (tickets.edit_all), read-only otherwise. */}
            {[
              { k: 'Category', field: 'category', value: ticket.category, type: 'text' },
              {
                k: 'Priority',
                field: 'priority',
                value: ticket.priority,
                type: 'select',
                options: ['Critical', 'High', 'Medium', 'Low'],
              },
              { k: 'Department', field: 'department', value: ticket.department, type: 'text' },
              { k: 'Shop', field: 'shop', value: ticket.shop, type: 'text' },
              { k: 'Platforms', field: 'platforms', value: ticket.platforms, type: 'platforms' },
            ].map(({ k, field, value, type, options }) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {k}
                </span>
                {canEditAll && type === 'select' ? (
                  <select
                    value={value || ''}
                    onChange={e => patchTicket({ [field]: e.target.value })}
                    aria-label={k}
                    style={{
                      ...S.select,
                      width: 'auto',
                      padding: '3px 24px 3px 8px',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {options.map(o => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : canEditAll && type === 'platforms' ? (
                  <input
                    key={`platforms-${ticket.id}`}
                    defaultValue={(ticket.platforms || []).join(', ')}
                    aria-label="Platforms (comma separated)"
                    placeholder="e.g. Shopify, iOS"
                    onBlur={e => {
                      const arr = e.target.value
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean);
                      const prev = ticket.platforms || [];
                      if (arr.join('|') !== prev.join('|')) patchTicket({ platforms: arr });
                    }}
                    style={S.inlineEdit}
                  />
                ) : canEditAll ? (
                  <input
                    key={`${field}-${ticket.id}`}
                    defaultValue={value || ''}
                    aria-label={k}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v !== (value || '')) patchTicket({ [field]: v });
                    }}
                    style={S.inlineEdit}
                  />
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                    {type === 'platforms'
                      ? (ticket.platforms || []).join(', ') || '—'
                      : value || '—'}
                  </span>
                )}
              </div>
            ))}
            {[
              ['Created', ticket.created],
              ['Last Updated', ticket.updated],
              ...(statusCategoryFor(ticket.status) === 'done'
                ? [['Date Completed', ticket.updated]]
                : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{k}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Description
            </div>
            {canEditAll ? (
              <textarea
                key={`desc-${ticket.id}`}
                defaultValue={ticket.description || ''}
                aria-label="Ticket description"
                onBlur={e => {
                  const v = e.target.value;
                  if (v !== (ticket.description || '')) patchTicket({ description: v });
                }}
                style={{ ...S.textarea, fontSize: '13px', minHeight: '90px', lineHeight: 1.6 }}
              />
            ) : (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.description}
              </div>
            )}
          </div>
          {ticket.currentResult && (
            <div
              style={{
                marginTop: '14px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Current result
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.currentResult}
              </div>
            </div>
          )}
          {ticket.expectedResult && (
            <div
              style={{
                marginTop: '14px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Expected result
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.expectedResult}
              </div>
            </div>
          )}
          {/* Attachment summary line is replaced by the dedicated preview card above. */}
          {/* Status changes live in the Status card's dropdown above. */}
        </div>
      </div>

      {/* Messaging */}
      <div style={S.card}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            marginBottom: '14px',
          }}
        >
          Messages
        </div>
        {convoHidden ? (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '18px 8px',
            }}
          >
            🔒 This conversation is private to the requester, the current assignee, and superadmins.
          </div>
        ) : (
          <>
            <div
              style={{
                maxHeight: '280px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              {messages.map((m, i) => {
                const isYou = m.authorEmail
                  ? m.authorEmail === currentUser?.email
                  : m.from === 'You' || m.from === (_currentActor?.name || '');
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: isYou ? 'row-reverse' : 'row',
                      gap: '8px',
                      alignItems: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: isYou ? 'var(--accent-primary)' : 'var(--bg-branded)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {m.from[0]}
                    </div>
                    <div style={{ maxWidth: '70%' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginBottom: '3px',
                          textAlign: isYou ? 'right' : 'left',
                        }}
                      >
                        {m.from} · {m.time}
                      </div>
                      <div
                        style={{
                          background: isYou ? 'var(--accent-primary)' : 'var(--bg-hover)',
                          color: isYou ? '#fff' : 'var(--text-secondary)',
                          padding: '10px 14px',
                          borderRadius: isYou ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          fontSize: '13px',
                          lineHeight: 1.5,
                        }}
                      >
                        {renderWithMentions(m.text, m.mentions)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {!DONE_STATUSES.has(ticket.status) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {canViewAll && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      [
                        'Suggest a reply…',
                        `Hi ${ticket.requester?.name?.split(' ')[0] || 'there'}, thanks for the report — we're looking into this now and will update you here shortly.`,
                      ],
                      [
                        'Can I get more info…?',
                        'Could you share a bit more detail — exact steps to reproduce, the account or shop affected, and a screenshot if possible?',
                      ],
                      [
                        'Status update…',
                        `Quick update: this ticket is currently "${ticket.status}". `,
                      ],
                    ].map(([label, template]) => (
                      <button
                        key={label}
                        onClick={() => setNewMsg(template)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '100px',
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-page)',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
                  {mentionQuery && mentionMatches.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 40,
                        width: '280px',
                        maxHeight: '190px',
                        overflowY: 'auto',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '10px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        padding: '4px',
                      }}
                    >
                      {mentionMatches.map(u => (
                        <button
                          key={u.email}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            pickMention(u);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '7px 10px',
                            borderRadius: '7px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                          }}
                        >
                          @{u.name}{' '}
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                            {u.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    value={newMsg}
                    onChange={e => handleComposerChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape' && mentionQuery) {
                        setMentionQuery(null);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        if (mentionQuery && mentionMatches.length > 0) {
                          e.preventDefault();
                          pickMention(mentionMatches[0]);
                          return;
                        }
                        sendMsg();
                      }
                    }}
                    placeholder="Type a message… (@ to tag someone)"
                    style={{ ...S.input, flex: 1 }}
                  />
                  <button onClick={sendMsg} style={{ ...S.orangeBtn, whiteSpace: 'nowrap' }}>
                    Send
                  </button>
                </div>
              </div>
            )}
            {DONE_STATUSES.has(ticket.status) && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '8px',
                }}
              >
                This ticket is closed — the transcript stays available for look-back.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── SLA chip ─────────────────────────────────────────────────────────────────
// Prefers the server-persisted SLA engine fields (ticket.sla — deadlines,
// pause, breach flags stamped by the BFF); falls back to the legacy
// client-side estimate from constants for mock mode / pre-engine tickets.
function SlaChip({ ticket }) {
  const fmt = h => (h >= 24 ? `${Math.floor(h / 24)}d` : `${Math.round(h)}h`);
  const sla = ticket?.sla;
  if (sla && (sla.resolutionDueAt || sla.responseDueAt)) {
    if (sla.resolvedAt || DONE_STATUSES.has(ticket.status)) return null;
    if (sla.pausedAt) {
      return (
        <span
          title="SLA clock paused — waiting for customer"
          style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)',
            fontWeight: 700,
          }}
        >
          ⏸ SLA paused
        </span>
      );
    }
    const now = Date.now();
    const due = sla.resolutionDueAt ? new Date(sla.resolutionDueAt).getTime() : null;
    const breached = sla.resolutionBreached || (due && now > due);
    const responseBreached =
      !sla.firstResponseAt &&
      (sla.responseBreached || (sla.responseDueAt && now > new Date(sla.responseDueAt).getTime()));
    const atRisk =
      due && !breached && now > due - (due - new Date(ticket.created).getTime()) * 0.25;
    if (!breached && !responseBreached && !atRisk) return null;
    const overdueHrs = due ? Math.max(0, (now - due) / 3600000) : 0;
    const palette = breached
      ? {
          bg: 'rgba(220, 38, 38, 0.18)',
          fg: '#B91C1C',
          label: `🔴 SLA breached +${fmt(overdueHrs)}`,
        }
      : responseBreached
        ? { bg: 'rgba(220, 38, 38, 0.18)', fg: '#B91C1C', label: '🔴 Response SLA missed' }
        : { bg: 'rgba(245, 158, 11, 0.18)', fg: '#92400E', label: '🟡 SLA at risk' };
    const title = due
      ? `Resolution due ${new Date(due).toLocaleString()}`
      : `Response due ${new Date(sla.responseDueAt).toLocaleString()}`;
    return (
      <span
        title={title}
        style={{
          fontSize: '10px',
          padding: '2px 7px',
          borderRadius: '4px',
          background: palette.bg,
          color: palette.fg,
          fontWeight: 700,
        }}
      >
        {palette.label}
      </span>
    );
  }
  const state = slaStateFor(ticket);
  if (state === 'ok') return null;
  const target = SLA_TARGETS_HOURS[ticket.priority];
  if (!target) return null;
  const ageHrs = (Date.now() - new Date(ticket.created).getTime()) / 3600000;
  const overdueHrs = Math.max(0, ageHrs - target.resolution);
  const palette =
    state === 'breached'
      ? {
          bg: 'rgba(220, 38, 38, 0.18)',
          fg: '#B91C1C',
          label: `🔴 SLA breached +${fmt(overdueHrs)}`,
        }
      : { bg: 'rgba(245, 158, 11, 0.18)', fg: '#92400E', label: `🟡 SLA at risk` };
  const title = `Priority ${ticket.priority}: resolution target ${target.resolution}h; age ${fmt(ageHrs)}`;
  return (
    <span
      title={title}
      style={{
        fontSize: '10px',
        padding: '2px 7px',
        borderRadius: '4px',
        background: palette.bg,
        color: palette.fg,
        fontWeight: 700,
      }}
    >
      {palette.label}
    </span>
  );
}

// ─── Jira sync chip ───────────────────────────────────────────────────────────
function JiraSyncChip({ ticket }) {
  if (!ticket) return null;
  const state = ticket.jiraSyncState || (ticket.jiraKey ? 'synced' : 'local-only');
  const palette = {
    synced: {
      bg: 'rgba(59, 130, 246, 0.18)',
      fg: '#1D4ED8',
      label: `🔵 ${ticket.jiraKey || 'Jira'}`,
    },
    syncing: { bg: 'rgba(245, 158, 11, 0.18)', fg: '#92400E', label: '🔄 Syncing…' },
    error: { bg: 'rgba(220, 38, 38, 0.18)', fg: '#B91C1C', label: '❌ Sync error' },
    diverged: { bg: 'rgba(234, 88, 12, 0.16)', fg: 'var(--accent-primary)', label: '⚠️ Diverged' },
    'local-only': { bg: 'var(--bg-hover)', fg: 'var(--text-secondary)', label: '⚪ Local only' },
  };
  const p = palette[state] || palette['local-only'];
  const title =
    state === 'error'
      ? ticket.jiraSyncError || 'Sync error'
      : state === 'synced' && ticket.jiraSyncedAt
        ? `Synced with ${ticket.jiraKey} at ${new Date(ticket.jiraSyncedAt).toLocaleString()}`
        : state === 'local-only'
          ? 'No Jira link — submit while Jira is configured to create one'
          : '';
  return (
    <span
      title={title}
      style={{
        fontSize: '10px',
        padding: '2px 7px',
        borderRadius: '4px',
        background: p.bg,
        color: p.fg,
        fontWeight: 700,
      }}
    >
      {p.label}
    </span>
  );
}

// ─── Development chip ─────────────────────────────────────────────────────────
// The "symbol" on a ticket row signalling linked development activity, mirroring
// the compact dev cluster Jira renders on board cards. Tinted red when a build
// is failing, purple when every PR is merged, blue otherwise. Hidden when the
// ticket has no dev data.
function DevChip({ ticket }) {
  const d = devSummary(ticket);
  if (!d.hasAny) return null;
  const allMerged = d.prCount > 0 && d.prSummary.merged === d.prCount;
  const palette =
    d.builds.status === 'failing'
      ? { bg: 'rgba(220, 38, 38, 0.18)', fg: '#B91C1C' }
      : allMerged
        ? { bg: 'rgba(147, 51, 234, 0.14)', fg: '#7E22CE' }
        : { bg: 'rgba(59, 130, 246, 0.12)', fg: '#1D4ED8' };
  const buildIcon =
    d.builds.status === 'failing' ? '❌' : d.builds.status === 'pending' ? '🟡' : '✅';
  const title =
    `${d.prCount} pull request${d.prCount !== 1 ? 's' : ''}` +
    (d.branches ? ` · ${d.branches} branches` : '') +
    (d.builds.failing
      ? ` · ${d.builds.failing} build${d.builds.failing > 1 ? 's' : ''} failing`
      : d.builds.total
        ? ' · builds passing'
        : '');
  return (
    <span
      aria-label={`Development: ${d.prCount} pull requests`}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '10px',
        padding: '2px 7px',
        borderRadius: '4px',
        background: palette.bg,
        color: palette.fg,
        fontWeight: 700,
      }}
    >
      🔀 {d.prCount}
      {d.builds.total ? <> {buildIcon}</> : null}
    </span>
  );
}

// ─── Pull-request detail card ─────────────────────────────────────────────────
// One expandable PR inside the Development popup. Collapsed: status, title,
// repo#number, reviewers, CI rollup, last-updated — the "more details" view.
// The header links straight to the PR on GitHub; expanding reveals branch flow,
// change stats and per-reviewer state.
function PrCard({ pr }) {
  const [open, setOpen] = useState(false);
  const sm = prStatusMeta(pr.status);
  const cm = prCheckMeta(pr.checks?.status);
  const reviewerInitials = (pr.reviews || []).slice(0, 3).map(r =>
    (r.reviewer || '?')
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  );
  return (
    <div
      style={{
        background: 'var(--bg-page)',
        borderRadius: '10px',
        border: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
        <span title={sm.label} style={{ fontSize: '15px', flexShrink: 0 }}>
          {sm.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open pull request #${pr.number} on GitHub`}
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pr.title} ↗
          </a>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {pr.repo} #{pr.number} · updated {relativeTime(pr.lastUpdate) || '—'}
          </div>
        </div>
        {reviewerInitials.length > 0 && (
          <div style={{ display: 'flex', flexShrink: 0 }}>
            {reviewerInitials.map((ini, i) => (
              <span
                key={i}
                title="Reviewer"
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-primary)',
                  fontSize: '9px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--bg-surface)',
                  marginLeft: i ? '-7px' : 0,
                }}
              >
                {ini}
              </span>
            ))}
          </div>
        )}
        <span
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: '100px',
            background: sm.bg,
            color: sm.fg,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {sm.label}
        </span>
        {cm && (
          <span
            title={cm.label}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '100px',
              background: cm.bg,
              color: cm.fg,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {cm.icon}
          </span>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse details' : 'Expand details'}
          aria-expanded={open}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--border-strong)',
            fontSize: '14px',
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          ›
        </button>
      </div>

      {open && (
        <div
          style={{
            padding: '0 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '12px',
            }}
          >
            <span
              style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}
            >
              {pr.sourceBranch}
            </span>
            <span>→</span>
            <span
              style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}
            >
              {pr.targetBranch}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>
              {pr.author?.name || pr.author?.login || '—'}
            </strong>
            {' · '}+{pr.additions ?? 0} / −{pr.deletions ?? 0} · {pr.changedFiles ?? 0} files ·{' '}
            {pr.commentCount ?? 0} comments
          </div>
          {pr.checks && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              CI: {pr.checks.passed}/{pr.checks.total} passing
              {pr.checks.failed ? ` · ${pr.checks.failed} failing` : ''}
              {pr.checks.pending ? ` · ${pr.checks.pending} running` : ''}
            </div>
          )}
          {pr.reviews && pr.reviews.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {pr.reviews.map((r, i) => {
                const rp =
                  r.state === 'APPROVED'
                    ? { bg: 'rgba(22, 163, 74, 0.18)', fg: '#15803D', label: '✓ Approved' }
                    : r.state === 'CHANGES_REQUESTED'
                      ? {
                          bg: 'rgba(220, 38, 38, 0.18)',
                          fg: '#B91C1C',
                          label: '✕ Changes requested',
                        }
                      : {
                          bg: 'var(--bg-hover)',
                          fg: 'var(--text-secondary)',
                          label: '💬 Commented',
                        };
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {r.reviewer}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '100px',
                        background: rp.bg,
                        color: rp.fg,
                        fontWeight: 700,
                      }}
                    >
                      {rp.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...S.orangeBtn,
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
              fontSize: '13px',
              padding: '8px',
            }}
          >
            Open in GitHub ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Development popup (pull-request breakdown) ───────────────────────────────
// The "more details" screen that opens from the Development panel's pull-request
// line. Shows the merged / open / failing breakdown and one PrCard per PR.
function DevelopmentPopup({ ticket, prs, onClose }) {
  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);
  const summary = prSummary(prs);
  const Count = ({ value, label, color }) => (
    <div
      aria-label={`${label}: ${value}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '56px' }}
    >
      <span style={{ fontSize: '20px', fontWeight: 900, color }}>{value}</span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
    </div>
  );
  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          zIndex: 320,
          animation: 'fadeIn 0.15s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pull requests"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          zIndex: 321,
          width: '600px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'var(--bg-branded)',
            padding: '18px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.4)',
                fontWeight: 700,
                marginBottom: '4px',
                letterSpacing: '0.06em',
              }}
            >
              {ticket.id}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>
              Pull Requests ({summary.total})
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '18px',
            justifyContent: 'center',
            padding: '16px 22px',
            borderBottom: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <Count value={summary.merged} label="Merged" color="#7E22CE" />
          <Count value={summary.open + summary.draft} label="Open" color="#1D4ED8" />
          <Count
            value={summary.failing}
            label="Failing"
            color={summary.failing > 0 ? '#B91C1C' : 'var(--text-muted)'}
          />
        </div>

        <div
          style={{
            overflowY: 'auto',
            padding: '16px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {prs.map(pr => (
            <PrCard key={pr.id || pr.number} pr={pr} />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Development panel (ticket detail) ────────────────────────────────────────
// Mirrors Jira's "Development" widget: a compact summary of branches, commits,
// pull requests (with the latest PR's status badge) and build health. The pull
// requests and build lines open the DevelopmentPopup for the full breakdown.
function DevelopmentPanel({ ticket }) {
  const { prs, source } = usePullRequests(ticket?.jiraKey, ticket);
  const [popupOpen, setPopupOpen] = useState(false);
  const d = useMemo(() => devSummary({ ...ticket, pullRequests: prs }), [ticket, prs]);
  if (!d.hasAny) return null;

  const prMeta = d.prStatus ? prStatusMeta(d.prStatus) : null;
  const buildLine =
    d.builds.status === 'failing'
      ? {
          icon: '🔴',
          text: `${d.builds.failing} build${d.builds.failing > 1 ? 's' : ''} failing`,
          color: '#B91C1C',
        }
      : d.builds.status === 'pending'
        ? {
            icon: '🟡',
            text: `${d.builds.pending} build${d.builds.pending > 1 ? 's' : ''} running`,
            color: '#92400E',
          }
        : d.builds.total
          ? { icon: '🟢', text: 'Builds passing', color: '#15803D' }
          : null;

  const Row = ({ icon, children, onClick, ...rest }) => {
    const base = {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 10px',
      borderRadius: '8px',
      fontSize: '13px',
      width: '100%',
      textAlign: 'left',
    };
    const content = (
      <>
        <span style={{ width: '18px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1 }}>{children}</span>
      </>
    );
    return onClick ? (
      <button
        onClick={onClick}
        {...rest}
        style={{
          ...base,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: 'var(--accent-primary)',
          fontWeight: 700,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {content}
      </button>
    ) : (
      <div {...rest} style={{ ...base, color: 'var(--text-secondary)' }}>
        {content}
      </div>
    );
  };

  return (
    <div
      style={{
        ...S.card,
        marginBottom: '20px',
        borderLeft: `4px solid ${d.builds.status === 'failing' ? '#EF4444' : '#6366F1'}`,
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
          🧬 Development
        </span>
        {source === 'jira' && (
          <span
            style={{
              fontSize: '10px',
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.18)',
              color: '#1D4ED8',
              fontWeight: 700,
            }}
          >
            via Jira
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {d.branches > 0 && (
          <Row icon="⎇">
            {d.branches} branch{d.branches > 1 ? 'es' : ''}
          </Row>
        )}
        {d.commits > 0 && (
          <Row icon="◆">
            {d.commits} commit{d.commits > 1 ? 's' : ''}
            {d.lastCommitAt && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {' '}
                · {relativeTime(d.lastCommitAt)}
              </span>
            )}
          </Row>
        )}
        {d.prCount > 0 && (
          <Row
            icon="⇄"
            onClick={() => setPopupOpen(true)}
            aria-label={`${d.prCount} pull requests`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {d.prCount} pull request{d.prCount > 1 ? 's' : ''}
              {prMeta && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: '3px',
                    background: prMeta.bg,
                    color: prMeta.fg,
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                  }}
                >
                  {prMeta.label.toUpperCase()}
                </span>
              )}
            </span>
          </Row>
        )}
        {buildLine && (
          <Row icon="↻" onClick={() => setPopupOpen(true)} aria-label="Build status">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: buildLine.color,
                fontWeight: 700,
              }}
            >
              {buildLine.text} {buildLine.icon}
            </span>
          </Row>
        )}
      </div>

      {popupOpen && (
        <DevelopmentPopup ticket={ticket} prs={prs} onClose={() => setPopupOpen(false)} />
      )}
    </div>
  );
}

// ─── Recent Activity feed (Home) ──────────────────────────────────────────────
// Live view of the most-recently-updated tickets, plus (admin only) the last
// few audit entries so admins see admin actions on their dashboard.
function RecentActivityFeed({ onTicket, setSection }) {
  const can = useCan();
  const canSeeAudit = can('audit.view');
  const [, _setV] = useState(0);
  useEffect(() => subscribeTickets(_setV), []);
  useEffect(() => subscribeAudit(_setV), []);

  const recentTickets = useMemo(() => {
    return MOCK_TICKETS.slice()
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
      .slice(0, canSeeAudit ? 3 : 5);
  }, [canSeeAudit]);

  const recentAudit = useMemo(() => {
    if (!canSeeAudit) return [];
    return listAudit().slice(0, 3);
  }, [canSeeAudit]);

  const auditLabel = a => AUDIT_ACTION_LABELS[a] || a;

  const fmtAgo = iso => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Recent Activity
        </div>
        {canSeeAudit && (
          <button
            onClick={() => setSection('audit')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-primary)',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            View full audit log →
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {recentTickets.map(t => (
          <button
            key={t.id}
            onClick={() => onTicket(t)}
            style={{
              ...S.card,
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 18px',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(124,58,237,0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
            }}
          >
            <span style={S.badge(PRIORITY_COLORS[t.priority])}>{t.priority}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {t.id} · {t.category} · updated {t.updated}
              </div>
            </div>
            <span style={S.badge(STATUS_COLORS[t.status])}>{t.status}</span>
            <span style={{ color: 'var(--border-strong)', fontSize: '16px', flexShrink: 0 }}>
              ↗
            </span>
          </button>
        ))}
        {recentAudit.length > 0 && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Admin actions
          </div>
        )}
        {recentAudit.map(e => (
          <div
            key={e.id}
            style={{
              ...S.card,
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '10px 16px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                flexShrink: 0,
              }}
            >
              {auditLabel(e.action)}
            </div>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>
              {e.actorName}
              {e.targetLabel ? ` · ${e.targetLabel}` : ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
              {fmtAgo(e.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Ticket Popup Modal (Home Recent Activity) ────────────────────────────────
function TicketPopupModal({ ticket, onClose, onOpenFull }) {
  const can = useCan();
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          zIndex: 300,
          animation: 'fadeIn 0.15s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ticket?.title || 'Ticket details'}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          zIndex: 301,
          width: '540px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--bg-branded)',
            padding: '18px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexShrink: 0,
          }}
        >
          <div>
            {onOpenFull ? (
              <button
                onClick={() => onOpenFull(ticket.id)}
                title="Open full ticket view"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginBottom: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  color: '#A5B4FC',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                {ticket.id} ↗
              </button>
            ) : (
              <div
                style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 700,
                  marginBottom: '4px',
                  letterSpacing: '0.06em',
                }}
              >
                {ticket.id}
              </div>
            )}
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', lineHeight: 1.3 }}>
              {ticket.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
              marginLeft: '14px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={S.badge(PRIORITY_COLORS[ticket.priority])}>{ticket.priority}</span>
            <span style={S.badge(STATUS_COLORS[ticket.status])}>{ticket.status}</span>
            <span style={{ ...S.badge('var(--text-secondary)'), fontSize: '11px' }}>
              {ticket.category}
            </span>
          </div>

          {/* Description */}
          <div style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '14px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              Description
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {ticket.description}
            </div>
          </div>
          {ticket.currentResult && (
            <div style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '14px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '6px',
                }}
              >
                Current result
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.currentResult}
              </div>
            </div>
          )}
          {ticket.expectedResult && (
            <div style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '14px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '6px',
                }}
              >
                Expected result
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.expectedResult}
              </div>
            </div>
          )}

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              ['Assignee', ticket.assignee || 'Unassigned'],
              ['Department', ticket.department || '—'],
              ['Shop', ticket.shop || '—'],
              ['Platforms', ticket.platforms?.join(', ') || '—'],
              ['Created', ticket.created],
              ['Last Updated', ticket.updated],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{ background: 'var(--bg-page)', borderRadius: '8px', padding: '10px 12px' }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '3px',
                  }}
                >
                  {k}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Activity Timeline
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ticket.timeline.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        flexShrink: 0,
                        marginTop: '3px',
                      }}
                    />
                    {i < ticket.timeline.length - 1 && (
                      <div
                        style={{
                          width: '1px',
                          flex: 1,
                          background: 'var(--border-default)',
                          marginTop: '3px',
                        }}
                      />
                    )}
                  </div>
                  <div style={{ paddingBottom: '6px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {t.action}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {t.date} · {t.actor}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message count */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '12px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            💬 {ticket.messages?.length || 0} message{ticket.messages?.length !== 1 ? 's' : ''} —
            open ticket in My Tickets to reply
          </div>
        </div>

        {/* Footer — admin/developer delete (gated by tickets.delete) */}
        {can('tickets.delete') && (
          <div
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--border-default)',
              padding: '12px 22px',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            {confirmDel ? (
              <>
                <span
                  style={{
                    fontSize: '13px',
                    color: '#DC2626',
                    fontWeight: 700,
                    marginRight: 'auto',
                  }}
                >
                  Delete this ticket permanently?
                </span>
                <button
                  onClick={() => {
                    deleteTicket(ticket.id);
                    onClose();
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    background: '#DC2626',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: '1px solid #FCA5A5',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#DC2626',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                <Trash2 size={14} /> Delete ticket
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ currentUser, setCurrentUser, onClose, onLogout }) {
  const { can, currentRole } = useRbacCtx();
  const canEditOwnProfile = can('users.edit');
  const [form, setForm, clearDraft] = usePersistentState('profile-edit', { ...currentUser });
  const avatarInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // Set/clear the avatar immediately (independent of the Save button) so the
  // picture persists server-side even for users who cannot edit other fields.
  const applyAvatar = async dataUrl => {
    setAvatarBusy(true);
    setAvatarError('');
    if (API_ENABLED) {
      const { error } = await usersApi.setMyAvatar(dataUrl);
      if (error) {
        setAvatarError(error);
        setAvatarBusy(false);
        return;
      }
    }
    setForm(f => ({ ...f, avatarUrl: dataUrl }));
    setCurrentUser(prev => ({ ...prev, avatarUrl: dataUrl }));
    setAvatarBusy(false);
  };

  const handleAvatarPick = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(file.type || '').startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    try {
      // Canvas re-encode to a small JPEG - keeps rows tiny and strips EXIF.
      const dataUrl = await compressImageToDataUrl(file, { maxWidth: 256, quality: 0.85 });
      await applyAvatar(dataUrl);
    } catch {
      setAvatarError('Could not read that image - try a different file.');
    }
  };
  const initials = form.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const save = () => {
    setCurrentUser(form);
    clearDraft();
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          zIndex: 400,
          animation: 'fadeIn 0.15s ease',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          zIndex: 401,
          width: '400px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--bg-branded)',
            padding: '20px 22px 40px',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '14px',
              right: '16px',
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            My Profile
          </div>
        </div>

        {/* Avatar — overlapping header. position/zIndex ensure it paints
            above the position:relative header instead of behind it. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '-32px',
            marginBottom: '16px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            aria-label="Change profile picture"
            title="Change profile picture"
            style={{
              position: 'relative',
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: avatarBusy ? 'wait' : 'pointer',
              borderRadius: '50%',
            }}
          >
            {form.avatarUrl ? (
              <img
                src={form.avatarUrl}
                alt="Profile"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid var(--bg-surface)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  display: 'block',
                  opacity: avatarBusy ? 0.6 : 1,
                }}
              />
            ) : (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                  border: '3px solid var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '22px',
                  fontWeight: 900,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  opacity: avatarBusy ? 0.6 : 1,
                }}
              >
                {initials}
              </div>
            )}
            <span
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                border: '2px solid var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
              }}
            >
              📷
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleAvatarPick}
          />
        </div>
        {(avatarError || form.avatarUrl) && (
          <div style={{ textAlign: 'center', marginTop: '-8px', marginBottom: '10px' }}>
            {avatarError ? (
              <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>
                {avatarError}
              </span>
            ) : (
              <button
                onClick={() => applyAvatar(null)}
                disabled={avatarBusy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Remove photo
              </button>
            )}
          </div>
        )}

        {/* Role badge — sourced from the role registry so custom roles
            (Developer, Admin, ...) render correctly, not just superadmin/user. */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '100px',
              background: (currentRole?.color || 'var(--text-primary)') + '18',
              color: currentRole?.color || 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {currentRole?.label || 'User'}
          </span>
        </div>

        {/* Fields */}
        <div
          style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          {[
            { key: 'name', label: 'Full Name' },
            { key: 'email', label: 'Email' },
            { key: 'department', label: 'Department' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label style={S.label}>{label}</label>
              {canEditOwnProfile ? (
                <input
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={S.input}
                />
              ) : (
                <div
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  {form[key]}
                </div>
              )}
            </div>
          ))}

          {canEditOwnProfile && (
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}
            >
              <button onClick={onClose} style={S.ghostBtn}>
                Cancel
              </button>
              <button onClick={save} style={S.orangeBtn}>
                Save Changes
              </button>
            </div>
          )}
        </div>

        {/* Sign Out */}
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ height: '1px', background: 'var(--bg-hover)', margin: '0 0 16px' }} />
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#DC2626',
              border: '1.5px solid #DC2626',
              borderRadius: '8px',
              padding: '10px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Pages ────────────────────────────────────────────────────────────────────
function HomePage({ setSection, role }) {
  const can = useCan();
  const canViewAll = can('tickets.view_all');
  const open = MOCK_TICKETS.filter(t => statusCategoryFor(t.status) !== 'done').length;
  const resolved = MOCK_TICKETS.filter(t => statusCategoryFor(t.status) === 'done').length;
  const [activeTicket, setActiveTicket] = useState(null);

  // Admin-only stats: critical open, oldest unresolved age, p50 resolution time, SLA breaches
  const adminStats = useMemo(() => {
    if (!canViewAll) return null;
    const now = Date.now();
    const isOpen = t => !DONE_STATUSES.has(t.status);
    const critical = MOCK_TICKETS.filter(t => t.priority === 'Critical' && isOpen(t)).length;
    const unresolved = MOCK_TICKETS.filter(isOpen);
    const oldestAgeDays =
      unresolved.length === 0
        ? 0
        : Math.max(
            ...unresolved.map(t => Math.floor((now - new Date(t.created).getTime()) / 86400000))
          );
    const resolvedTickets = MOCK_TICKETS.filter(t => DONE_STATUSES.has(t.status));
    const avgResolutionDays =
      resolvedTickets.length === 0
        ? 0
        : Math.round(
            resolvedTickets.reduce(
              (acc, t) => acc + Math.max(0, (new Date(t.updated) - new Date(t.created)) / 86400000),
              0
            ) / resolvedTickets.length
          );
    const slaBreached = MOCK_TICKETS.filter(t => slaStateFor(t) === 'breached').length;
    const slaAtRisk = MOCK_TICKETS.filter(t => slaStateFor(t) === 'at-risk').length;
    return {
      critical,
      oldestAgeDays,
      avgResolutionDays,
      unresolvedCount: unresolved.length,
      slaBreached,
      slaAtRisk,
    };
  }, [canViewAll]);

  return (
    <div>
      {/* Edge-to-edge hero banner */}
      <div
        style={{
          position: 'relative',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100vw',
          marginTop: '-32px',
          marginBottom: '28px',
          background: 'linear-gradient(150deg, var(--bg-branded) 0%, #1F0F40 55%, #3F1E80 100%)',
          padding: '64px 40px 68px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 70% 80% at 50% 120%, rgba(43,79,138,0.6) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent-primary)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: '14px',
            }}
          >
            IT Service Management
          </div>
          <h1
            style={{
              fontSize: '48px',
              fontWeight: 900,
              color: '#fff',
              margin: '0 0 14px',
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}
          >
            Pomelo TechOps Portal
          </h1>
          <p
            style={{
              fontSize: '16px',
              color: 'rgba(255,255,255,0.65)',
              margin: '0 0 36px',
              fontWeight: 400,
            }}
          >
            Your single hub for IT support, documentation, and service requests.
          </p>
          <button
            onClick={() => setSection('submit')}
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '100px',
              padding: '16px 40px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 900,
              fontSize: '16px',
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            Submit a Ticket
          </button>
        </div>
      </div>

      {/* Featured docs — visible to everyone when admin pins them */}
      {(() => {
        const featured = listFeaturedDocs();
        if (featured.length === 0) return null;
        return (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#92400E',
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              📌 Featured by IT
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
              }}
            >
              {featured.slice(0, 3).map(d => (
                <button
                  key={d.id}
                  onClick={() => setSection('docs')}
                  style={{
                    textAlign: 'left',
                    background: 'rgba(245, 158, 11, 0.10)',
                    border: '1px solid #FDE68A',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>{d.icon || '📄'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#92400E',
                          fontWeight: 700,
                          marginTop: '2px',
                        }}
                      >
                        {d.category}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {adminStats && (
        <div
          style={{
            background: 'linear-gradient(135deg, var(--bg-branded) 0%, var(--bg-branded-2) 100%)',
            borderRadius: '14px',
            padding: '20px 24px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  background: 'var(--accent-primary)',
                  borderRadius: '8px',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '17px',
                }}
              >
                🛠
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: '14px' }}>
                  Admin dashboard
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', marginTop: '2px' }}
                >
                  Live ticket health across the queue
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    color: 'var(--accent-primary)',
                    fontWeight: 900,
                    fontSize: '22px',
                    lineHeight: 1,
                  }}
                >
                  {adminStats.unresolvedCount}
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '3px' }}
                >
                  Open
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#DC2626', fontWeight: 900, fontSize: '22px', lineHeight: 1 }}>
                  {adminStats.critical}
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '3px' }}
                >
                  Critical Active
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#FBBF24', fontWeight: 900, fontSize: '22px', lineHeight: 1 }}>
                  {adminStats.oldestAgeDays}d
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '3px' }}
                >
                  Oldest Unresolved
                </div>
              </div>
              <button
                onClick={() => setSection('mytickets')}
                title={`${adminStats.slaBreached} breached + ${adminStats.slaAtRisk} at risk — click for My Tickets`}
                style={{
                  textAlign: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    color: adminStats.slaBreached > 0 ? '#FCA5A5' : '#fff',
                    fontWeight: 900,
                    fontSize: '22px',
                    lineHeight: 1,
                  }}
                >
                  {adminStats.slaBreached}
                  {adminStats.slaAtRisk > 0 && (
                    <span style={{ fontSize: '13px', color: '#FBBF24', marginLeft: '4px' }}>
                      +{adminStats.slaAtRisk}
                    </span>
                  )}
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '3px' }}
                >
                  SLA Breached
                </div>
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: '22px', lineHeight: 1 }}>
                  {adminStats.avgResolutionDays}d
                </div>
                <div
                  style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '3px' }}
                >
                  Avg Resolution
                </div>
              </div>
              <button
                onClick={() => setSection('admin')}
                style={{
                  alignSelf: 'center',
                  background: 'rgba(124,58,237,0.2)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '7px',
                  padding: '8px 14px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open Console →
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        {[
          { num: MOCK_TICKETS.length, label: 'Total Tickets', color: 'var(--text-primary)' },
          { num: open, label: 'Active', color: 'var(--accent-primary)' },
          { num: resolved, label: 'Resolved', color: '#16A34A' },
        ].map(s => (
          <div key={s.label} style={S.statCard}>
            <div style={{ ...S.statNum, color: s.color }}>{s.num}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '14px',
        }}
      >
        Quick Actions
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        {[
          { icon: '🔑', label: 'Password Reset', desc: 'Reset account or MFA', section: 'docs' },
          {
            icon: '🖥️',
            label: 'Hardware Request',
            desc: 'Replacement or loaner',
            section: 'submit',
          },
          { icon: '🌐', label: 'VPN Setup', desc: 'Remote access guide', section: 'docs' },
          { icon: '🎟️', label: 'My Tickets', desc: 'View & track requests', section: 'mytickets' },
        ].map(q => (
          <button
            key={q.label}
            onClick={() => setSection(q.section)}
            style={{
              background: 'var(--bg-surface)',
              border: '1.5px solid var(--border-default)',
              borderRadius: '10px',
              padding: '16px 20px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(124,58,237,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <span style={{ fontSize: '24px' }}>{q.icon}</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {q.label}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {q.desc}
              </div>
            </div>
          </button>
        ))}
      </div>

      <RecentActivityFeed role={role} onTicket={setActiveTicket} setSection={setSection} />

      {activeTicket && (
        <TicketPopupModal ticket={activeTicket} onClose={() => setActiveTicket(null)} />
      )}
    </div>
  );
}

const EMPTY_FORM = {
  email: '',
  title: '',
  description: '',
  currentResult: '',
  expectedResult: '',
  platforms: [],
  shop: '',
  priority: '',
  department: '',
  files: [],
  issueType: '',
  components: [],
  labels: '',
};

function PlatformCheckbox({ value, selected, onChange }) {
  const checked = selected.includes(value);
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        borderRadius: '7px',
        cursor: 'pointer',
        background: checked ? 'var(--accent-soft)' : 'var(--bg-page)',
        border: `1.5px solid ${checked ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        fontSize: '13px',
        color: checked ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontWeight: checked ? 700 : 400,
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(value)}
        style={{ display: 'none' }}
      />
      <span
        style={{
          width: '15px',
          height: '15px',
          borderRadius: '4px',
          flexShrink: 0,
          background: checked ? 'var(--accent-primary)' : 'var(--bg-input)',
          border: `1.5px solid ${checked ? 'var(--accent-primary)' : 'var(--border-strong)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <span style={{ color: '#fff', fontSize: '10px', lineHeight: 1 }}>✓</span>}
      </span>
      {value}
    </label>
  );
}

function FieldHint({ text }) {
  return (
    <div
      style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.5 }}
    >
      {text}
    </div>
  );
}

function SubmitPage({ setSection, showToast, currentUser }) {
  const canGlobal = useCan();
  // Board routing: members choose which team's board receives the ticket.
  // Hidden when there's at most one option; empty selection lets the server
  // route (request-type default → PESD1).
  const [, setSpacesTick] = useState(0);
  useEffect(() => subscribeSpaces(setSpacesTick), []);
  const boardOptions = allBoards().filter(
    b => canGlobal('tickets.view_all') || b.myRole === 'admin' || b.myRole === 'member'
  );
  const [boardSel, setBoardSel] = useState('');
  const workflow = useJiraWorkflow();
  const issueTypes = useIssueTypes();
  const components = useComponents();
  const initialStatus =
    (workflow.statuses.find(s => s.category === 'new') || workflow.statuses[0])?.name || 'To Do';
  const [form, setForm, clearDraft] = usePersistentState('submit', EMPTY_FORM, { omit: ['files'] });
  const [triage, setTriage] = useState(null); // { priority, reasoning, suggestedDocs, confidence }
  const [triaging, setTriaging] = useState(false);
  const [triageError, setTriageError] = useState('');

  const runTriage = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setTriageError('Add a title and description first.');
      return;
    }
    setTriaging(true);
    setTriageError('');
    setTriage(null);
    try {
      const res = await fetch('/api/v1/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          currentResult: form.currentResult.trim() || undefined,
          expectedResult: form.expectedResult.trim() || undefined,
          docs: listDocSummaries(),
        }),
      });
      if (res.status === 503) {
        setTriageError('AI triage is not configured on the server.');
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTriageError(err?.error || `HTTP ${res.status}`);
      } else {
        setTriage(await res.json());
      }
    } catch (e) {
      setTriageError(e.message || 'Could not reach triage.');
    } finally {
      setTriaging(false);
    }
  };

  const [showSuggester, setShowSuggester] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  const handleChange = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const togglePlatform = p => {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }));
  };

  const handleFiles = e => {
    const picked = Array.from(e.target.files || []);
    setForm(f => ({ ...f, files: [...f.files, ...picked] }));
  };

  const removeFile = idx => setForm(f => ({ ...f, files: f.files.filter((_, i) => i !== idx) }));

  const validate = () => {
    const e = {};
    if (!form.email.trim()) e.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Enter a valid email address';
    if (!form.title.trim()) e.title = 'Required';
    if (!form.description.trim()) e.description = 'Required';
    if (!form.priority) e.priority = 'Required';
    if (!form.shop) e.shop = 'Required';
    if (!form.department) e.department = 'Required';
    if (form.platforms.length === 0) e.platforms = 'Select at least one platform';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [submitting, setSubmitting] = useState(false);

  const buildLocalTicket = id => {
    const today = new Date().toISOString().slice(0, 10);
    const defaults = getSettings();
    return {
      id,
      title: form.title.trim(),
      category: form.category || 'General',
      priority: form.priority || 'Medium',
      status: initialStatus,
      created: today,
      updated: today,
      description: form.description.trim(),
      currentResult: form.currentResult.trim(),
      expectedResult: form.expectedResult.trim(),
      // Every new ticket lands with the configured default assignee
      // (typically the admin who triages incoming requests) so nothing
      // sits unassigned. Admin re-routes from the Board.
      assignee: defaults.defaultAssigneeName,
      assigneeEmail: defaults.defaultAssigneeEmail,
      department: form.department,
      shop: form.shop,
      platforms: [...form.platforms],
      issueType: form.issueType || null,
      components: [...form.components],
      labels: form.labels
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      attachmentCount: form.files.length,
      attachments: [], // populated below in submit() once files are read
      timeline: [{ date: today, actor: currentUser?.name || form.email, action: 'Ticket opened' }],
      messages: [],
      internalNotes: [],
      requester: {
        name: currentUser?.name || form.email,
        email: (currentUser?.email || form.email || '').toLowerCase(),
      },
    };
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    let ticketId;
    let jiraKey = null;
    let extraNote = '';

    if (isJiraConfigured()) {
      const result = await createJiraTicket(form);
      if (result.error) {
        setSubmitting(false);
        showToast(`Jira error: ${result.error}`, 'error');
        return;
      }
      ticketId = result.key;
      jiraKey = result.key;
      extraNote = ` (Jira: ${result.url})`;
      // Upload attachments if any
      if (form.files.length > 0) {
        try {
          const payload = {
            files: await Promise.all(
              form.files.slice(0, 10).map(
                file =>
                  new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = reader.result || '';
                      const dataBase64 = String(dataUrl).split(',')[1] || '';
                      resolve({
                        filename: file.name,
                        contentType: file.type || 'application/octet-stream',
                        dataBase64,
                      });
                    };
                    reader.onerror = () => reject(new Error('read'));
                    reader.readAsDataURL(file);
                  })
              )
            ),
          };
          await fetch(`/api/v1/jira/issue/${encodeURIComponent(jiraKey)}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          /* attachments are best-effort */
        }
      }
      setSubmitting(false);
    } else {
      await new Promise(r => setTimeout(r, 400));
      setSubmitting(false);
      const year = new Date().getFullYear();
      const num = String(Math.floor(Math.random() * 9000) + 1000);
      ticketId = `TKT-${year}-${num}`;
    }

    const ticket = buildLocalTicket(ticketId);
    if (jiraKey) {
      ticket.jiraKey = jiraKey;
      ticket.jiraSyncedAt = new Date().toISOString();
      ticket.jiraSyncState = 'synced';
    } else {
      ticket.jiraSyncState = 'local-only';
    }
    // Persist attachments as data URLs (capped per-file) so TicketDetail can
    // preview them. Larger files keep only metadata.
    if (form.files.length > 0) {
      ticket.attachments = await Promise.all(form.files.slice(0, 10).map(fileToAttachment));
    }
    if (boardSel) ticket.boardId = boardSel;
    addTicket(ticket);
    if (API_ENABLED) {
      // Persist to the backend; adopt the server's identity (uuid + canonical
      // key) on the local copy so later mutations target the real row.
      ticketsApi
        .createTicket({
          title: ticket.title,
          description: ticket.description || '',
          ...(boardSel ? { boardId: boardSel } : {}),
          ...(ticket.category ? { category: ticket.category } : {}),
          priority: ticket.priority || 'Medium',
          ...(ticket.department ? { department: ticket.department } : {}),
          ...(ticket.shop ? { shop: ticket.shop } : {}),
          platforms: ticket.platforms || [],
          labels: ticket.labels || [],
          ...(ISSUE_TYPES.includes(ticket.issueType) ? { issueType: ticket.issueType } : {}),
          ...(ticket.currentResult ? { currentResult: ticket.currentResult } : {}),
          ...(ticket.expectedResult ? { expectedResult: ticket.expectedResult } : {}),
        })
        .then(res => {
          if (res.error) return console.warn('[api] backend mirror failed:', res.error);
          const localId = ticket.id;
          updateTickets(ts =>
            ts.map(x =>
              x.id === localId
                ? { ...x, id: res.data.key, key: res.data.key, uuid: res.data.id }
                : x
            )
          );
        });
    }
    showToast(`Your ticket ${ticketId} has been submitted.${extraNote}`);
    clearDraft();
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSection?.('mytickets');
  };

  const err = k =>
    errors[k] ? (
      <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>{errors[k]}</div>
    ) : null;
  const borderOf = k => ({ borderColor: errors[k] ? '#DC2626' : 'var(--border-default)' });

  return (
    <div>
      <div style={S.pageTitle}>Submit a Ticket</div>
      <div style={S.pageSub}>
        Fill in all the details below so the TechOps team can action your request efficiently.
      </div>

      <div style={{ ...S.card, maxWidth: '760px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Email */}
          <div>
            <label style={S.label}>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="your.name@pomelo.com"
              style={{ ...S.input, ...borderOf('email') }}
            />
            <FieldHint text="Your work email address so the team can follow up with you directly." />
            {err('email')}
          </div>

          {/* Title */}
          <div>
            <label style={S.label}>Title *</label>
            <input
              value={form.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="Short, direct summary of your issue or request"
              style={{ ...S.input, ...borderOf('title') }}
            />
            <FieldHint
              text={
                'Keep it concise and specific — e.g. "Product images not uploading on Shopify TH".'
              }
            />
            {err('title')}
          </div>

          {/* Description */}
          <div>
            <label style={S.label}>Description *</label>
            <textarea
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Describe your issue in full. Include what you've already investigated, any calculations or logic you explored, your own thoughts on the cause, and any relevant context."
              style={{ ...S.textarea, minHeight: '130px', ...borderOf('description') }}
            />
            <FieldHint text="The more detail you add — including your own investigation — the faster we can resolve it." />
            {err('description')}
          </div>

          {/* Current Result */}
          <div>
            <label style={S.label}>Current Result</label>
            <textarea
              value={form.currentResult}
              onChange={e => handleChange('currentResult', e.target.value)}
              placeholder="What is happening right now? Describe the incorrect result or problem you're seeing."
              style={{ ...S.textarea, minHeight: '90px' }}
            />
            <FieldHint text="Skip this if you've already covered it in your description above." />
          </div>

          {/* Expected Result */}
          <div>
            <label style={S.label}>Expected Result</label>
            <textarea
              value={form.expectedResult}
              onChange={e => handleChange('expectedResult', e.target.value)}
              placeholder="What should be happening? What does the correct outcome or solution look like?"
              style={{ ...S.textarea, minHeight: '90px' }}
            />
            <FieldHint text="This tells the tech team exactly what a successful resolution looks like." />
          </div>

          {/* Board (team routing) — only when the user can pick between boards */}
          {API_ENABLED && boardOptions.length > 1 && (
            <div>
              <label style={S.label}>Board</label>
              <select
                value={boardSel}
                onChange={e => setBoardSel(e.target.value)}
                style={S.select}
                aria-label="Board"
              >
                <option value="">Auto (request routing)</option>
                {boardOptions.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.key === b.name ? b.key : `${b.key} · ${b.name}`}
                  </option>
                ))}
              </select>
              <FieldHint text="Which team's board should handle this ticket. Leave on Auto unless you know the owning team." />
            </div>
          )}

          {/* Platform Impacted */}
          <div>
            <label style={S.label}>Platform Impacted *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
              {PLATFORMS.map(p => (
                <PlatformCheckbox
                  key={p}
                  value={p}
                  selected={form.platforms}
                  onChange={togglePlatform}
                />
              ))}
            </div>
            <FieldHint text="Select all platforms that are affected by this issue or request." />
            {err('platforms')}
          </div>

          {/* Shop + Department */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={S.label}>Shop *</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={form.shop}
                  onChange={e => handleChange('shop', e.target.value)}
                  style={{ ...S.select, ...borderOf('shop') }}
                >
                  <option value="">Select shop</option>
                  {SHOPS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--text-muted)',
                  }}
                >
                  ▾
                </span>
              </div>
              <FieldHint text="Which shop is affected or needs to be updated?" />
              {err('shop')}
            </div>
            <div>
              <label style={S.label}>Department *</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={form.department}
                  onChange={e => handleChange('department', e.target.value)}
                  style={{ ...S.select, ...borderOf('department') }}
                >
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <span
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--text-muted)',
                  }}
                >
                  ▾
                </span>
              </div>
              <FieldHint text="Which department are you part of?" />
              {err('department')}
            </div>
          </div>

          {/* Issue Type (from Jira) */}
          <div>
            <label style={S.label}>Issue Type</label>
            <div style={{ position: 'relative' }}>
              <select
                value={form.issueType}
                onChange={e => handleChange('issueType', e.target.value)}
                style={S.select}
              >
                <option value="">Auto-detect</option>
                {issueTypes.issueTypes
                  .filter(t => !t.subtask)
                  .map(t => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }}
              >
                ▾
              </span>
            </div>
            <FieldHint
              text={
                issueTypes.source === 'jira'
                  ? `Live from your Jira project (${issueTypes.issueTypes.length} types).`
                  : "Using fallback types — connect Jira to load your project's real types."
              }
            />
          </div>

          {/* Components (from Jira) — only render if any exist */}
          {components.components.length > 0 && (
            <div>
              <label style={S.label}>Components</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {components.components.map(c => {
                  const checked = form.components.includes(c.name);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: checked ? 'var(--accent-soft)' : 'var(--bg-page)',
                        border: `1.5px solid ${checked ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                        fontSize: '12px',
                        color: checked ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: checked ? 700 : 400,
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          handleChange(
                            'components',
                            checked
                              ? form.components.filter(x => x !== c.name)
                              : [...form.components, c.name]
                          )
                        }
                        style={{ width: '14px', height: '14px' }}
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Labels — free-form, comma-separated */}
          <div>
            <label style={S.label}>Labels</label>
            <input
              type="text"
              value={form.labels}
              onChange={e => handleChange('labels', e.target.value)}
              placeholder="e.g. needs-followup, q2-revenue"
              aria-label="Labels"
              style={{ ...S.input, ...borderOf('labels') }}
            />
            <FieldHint text="Comma-separated tags. Synced to Jira labels on linked tickets." />
          </div>

          {/* Priority */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <label style={{ ...S.label, marginBottom: 0 }}>Priority *</label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={runTriage}
                  disabled={triaging}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: triaging ? 'var(--text-muted)' : 'var(--accent-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: triaging ? 'wait' : 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Sparkles size={14} strokeWidth={2} />
                  {triaging ? 'Triaging…' : 'AI Suggest'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSuggester(!showSuggester)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showSuggester ? 'Hide suggester' : '🧠 Smart Suggester'}
                </button>
              </div>
            </div>
            {triageError && (
              <div
                style={{
                  marginBottom: '8px',
                  padding: '8px 12px',
                  background: 'rgba(220, 38, 38, 0.10)',
                  color: '#B91C1C',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                ⚠ {triageError}
              </div>
            )}
            {triage && (
              <div
                style={{
                  marginBottom: '10px',
                  padding: '12px 14px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#1E3A8A',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    ✨ AI suggested
                  </span>
                  <span style={S.badge(PRIORITY_COLORS[triage.priority])}>{triage.priority}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(59, 130, 246, 0.18)',
                      color: '#1E3A8A',
                      fontWeight: 700,
                    }}
                  >
                    {triage.confidence} confidence
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      handleChange('priority', triage.priority);
                    }}
                    style={{
                      marginLeft: 'auto',
                      padding: '5px 12px',
                      background: '#1D4ED8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Accept
                  </button>
                </div>
                {triage.reasoning && (
                  <div
                    style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}
                  >
                    {triage.reasoning}
                  </div>
                )}
                {triage.suggestedDocs.length > 0 && (
                  <div
                    style={{
                      marginTop: '8px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}
                    >
                      📚 Relevant docs:
                    </span>
                    {triage.suggestedDocs.map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSection?.('docs')}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--bg-surface)',
                          border: '1px solid #BFDBFE',
                          borderRadius: '100px',
                          fontSize: '12px',
                          color: '#1E3A8A',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {d} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <select
                value={form.priority}
                onChange={e => handleChange('priority', e.target.value)}
                style={{ ...S.select, ...borderOf('priority') }}
              >
                <option value="">Select priority</option>
                {Object.keys(PRIORITY_COLORS).map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }}
              >
                ▾
              </span>
            </div>
            <FieldHint text="Consider business impact, effort required, and deadline. See the Priority Guide for definitions." />
            {err('priority')}
            {showSuggester && (
              <div style={{ marginTop: '10px' }}>
                <PrioritySuggester
                  onSelect={p => {
                    handleChange('priority', p);
                    setShowSuggester(false);
                  }}
                />
              </div>
            )}
            {form.priority && (
              <div
                style={{
                  marginTop: '10px',
                  background: PRIORITY_COLORS[form.priority] + '10',
                  border: `1.5px solid ${PRIORITY_COLORS[form.priority]}30`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <span style={S.badge(PRIORITY_COLORS[form.priority])}>{form.priority}</span>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Response:{' '}
                  <strong>{SLA_DATA.find(s => s.priority === form.priority)?.response}</strong> ·
                  Resolution:{' '}
                  <strong>{SLA_DATA.find(s => s.priority === form.priority)?.resolution}</strong>
                </div>
              </div>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label style={S.label}>File Upload</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-default)',
                borderRadius: '10px',
                padding: '24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--bg-page)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📎</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Click to upload files
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Screenshots, exports, spreadsheets — any files that help illustrate the issue
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFiles}
                style={{ display: 'none' }}
              />
            </div>
            {form.files.length > 0 && (
              <SubmitFilesPreview files={form.files} onRemove={removeFile} />
            )}
            <FieldHint text="If you have more files to share, contact the TechOps representative directly and they'll add them to the ticket." />
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '4px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => {
                clearDraft();
                setErrors({});
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={submitting}
              style={{
                ...S.ghostBtn,
                opacity: submitting ? 0.5 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Clear Form
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              style={{
                ...S.orangeBtn,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
              }}
            >
              {submitting ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Submitting…
                </>
              ) : (
                'Submit Ticket'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MyTicketsPage({ role, currentUser, openTicketKey, onOpenedTicket }) {
  const can = useCan();
  // The store array mutates IN PLACE (replaceArrayInPlace), so its reference
  // never changes — memos below must key on the version, not the array.
  const [ticketsVersion, _setTicketsVersion] = useState(0);
  useEffect(() => subscribeTickets(_setTicketsVersion), []);
  const tickets = MOCK_TICKETS;
  const [filter, setFilter] = usePersistentState('mytickets-filter', 'All');
  const [priorityFilter, setPriorityFilter] = usePersistentState('mytickets-priority', 'All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [staleOnly, setStaleOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId ? tickets.find(t => t.id === selectedId) : null;
  const [bulkIds, setBulkIds] = useState(new Set());

  // Deep link from a notification: open that ticket once it's in the store.
  // No dependency array on purpose — the store mutates in place (version bump
  // re-renders), so a cheap guarded check per render is the reliable hook.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openTicketKey) return;
    if (tickets.some(t => t.id === openTicketKey)) {
      setSelectedId(openTicketKey);
      onOpenedTicket?.();
    }
  });
  const [refreshMsg, setRefreshMsg] = useState('');
  const { addNotification } = useNotifications();

  // "Admin view" of My Tickets — full visibility, priority/stale filters,
  // bulk actions. Anyone with view_all capability gets it; per the design,
  // My Tickets always filters by requester for users without view_all.
  const isAdmin = can('tickets.view_all');
  const workflow = useJiraWorkflow();
  const assignable = useAssignableUsers();
  const STATUS_OPTIONS = workflow.statuses.map(s => s.name);
  const statuses = ['All', ...STATUS_OPTIONS];
  const assignees = useMemo(() => {
    const set = new Set(tickets.map(t => t.assignee).filter(Boolean));
    // Augment with Jira assignable users so admins can re-route to anyone eligible
    for (const u of assignable.users) set.add(u.displayName);
    return ['All', ...Array.from(set).sort(), 'Unassigned'];
  }, [tickets, assignable.users]);

  // Regular users see only tickets they submitted; admins see all.
  const visibleTickets = useMemo(() => {
    if (isAdmin) return tickets;
    const email = currentUser?.email?.toLowerCase();
    return tickets.filter(t => t.requester?.email?.toLowerCase() === email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, ticketsVersion, isAdmin, currentUser?.email]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return visibleTickets.filter(t => {
      if (filter !== 'All' && t.status !== filter) return false;
      if (isAdmin && priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
      if (isAdmin && assigneeFilter !== 'All') {
        if (assigneeFilter === 'Unassigned' && t.assignee) return false;
        if (assigneeFilter !== 'Unassigned' && t.assignee !== assigneeFilter) return false;
      }
      if (isAdmin && staleOnly) {
        if (statusCategoryFor(t.status) === 'done') return false;
        const ageDays = (now - new Date(t.updated).getTime()) / 86400000;
        if (ageDays < 7) return false;
      }
      return true;
    });
    // ticketsVersion: visibleTickets can be the same mutated-in-place array
    // (admins get the raw store), so the version must bust this memo too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTickets, ticketsVersion, filter, priorityFilter, assigneeFilter, staleOnly, isAdmin]);

  const handleStatusChange = (id, newStatus) => {
    const ticket = tickets.find(t => t.id === id);
    updateTickets(ts =>
      ts.map(t =>
        t.id === id
          ? { ...t, status: newStatus, updated: new Date().toISOString().slice(0, 10) }
          : t
      )
    );
    mirror(ticket?.uuid && ticketsApi.updateTicket(ticket.uuid, { status: newStatus }));
    if (ticket?.jiraKey) pushJiraTransition(ticket, newStatus);
  };

  const handleAssigneeChange = (id, assignee) => {
    const ticket = tickets.find(t => t.id === id);
    updateTickets(ts => ts.map(t => (t.id === id ? { ...t, assignee } : t)));
    mirror(
      ticket?.uuid &&
        ticketsApi.assignTicket(
          ticket.uuid,
          emailForAssignee(assignee) || null,
          assignee || undefined
        )
    );
  };

  const toggleBulk = id => {
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSetStatus = newStatus => {
    if (bulkIds.size === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const affected = tickets.filter(t => bulkIds.has(t.id));
    updateTickets(ts =>
      ts.map(t => (bulkIds.has(t.id) ? { ...t, status: newStatus, updated: today } : t))
    );
    affected.forEach(t => mirror(t.uuid && ticketsApi.updateTicket(t.uuid, { status: newStatus })));
    recordAudit('ticket.bulk_status', _currentActor, null, {
      count: bulkIds.size,
      status: newStatus,
    });
    // Push Jira transitions for any linked tickets (best-effort, parallel).
    affected.filter(t => t.jiraKey).forEach(t => pushJiraTransition(t, newStatus));
    setBulkIds(new Set());
  };

  const bulkReassign = assignee => {
    if (bulkIds.size === 0) return;
    const assigneeEmail = emailForAssignee(assignee);
    const affected = tickets.filter(t => bulkIds.has(t.id));
    updateTickets(ts => ts.map(t => (bulkIds.has(t.id) ? { ...t, assignee, assigneeEmail } : t)));
    affected.forEach(t =>
      mirror(
        t.uuid && ticketsApi.assignTicket(t.uuid, assigneeEmail || null, assignee || undefined)
      )
    );
    recordAudit('ticket.bulk_reassign', _currentActor, null, {
      count: bulkIds.size,
      assignee,
      assigneeEmail,
    });
    setBulkIds(new Set());
  };

  if (selected) {
    return (
      <TicketDetail
        ticket={selected}
        onBack={() => setSelectedId(null)}
        role={role}
        currentUser={currentUser}
        onStatusChange={handleStatusChange}
        onAssigneeChange={handleAssigneeChange}
        onAddNotification={addNotification}
        onOpenTicket={setSelectedId}
      />
    );
  }

  return (
    <div>
      <div style={S.pageTitle}>My Tickets</div>
      <div style={S.pageSub}>Track and manage all your IT requests.</div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '7px 14px',
              borderRadius: '100px',
              border: '1.5px solid',
              borderColor: filter === s ? 'var(--accent-primary)' : 'var(--border-default)',
              background: filter === s ? 'var(--accent-soft)' : 'var(--bg-surface)',
              color: filter === s ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '18px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              border: '1.5px solid var(--border-default)',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 700,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="All">All priorities</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <select
            aria-label="Filter by assignee"
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              border: '1.5px solid var(--border-default)',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 700,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          >
            {assignees.map(a => (
              <option key={a} value={a}>
                {a === 'All' ? 'All assignees' : a}
              </option>
            ))}
          </select>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={e => setStaleOnly(e.target.checked)}
              aria-label="Show stale tickets only"
            />
            Stale (no update in 7+ days)
          </label>
          <button
            onClick={async () => {
              setRefreshMsg('Refreshing…');
              const result = await pollJira('PESD1');
              if (!result) {
                setRefreshMsg('Refresh failed — Jira unreachable.');
                return;
              }
              setRefreshMsg(
                result.unavailable
                  ? 'Jira unavailable — local tickets unchanged.'
                  : `Refreshed: ${result.count} updated, ${result.reconciled || 0} reconciled, ${result.imported || 0} imported.`
              );
              setTimeout(() => setRefreshMsg(''), 5000);
            }}
            style={{
              marginLeft: 'auto',
              padding: '7px 12px',
              background: 'var(--bg-branded)',
              color: '#fff',
              border: 'none',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🔄 Refresh from Jira
          </button>
        </div>
      )}
      {isAdmin && refreshMsg && (
        <div
          style={{
            marginBottom: '12px',
            padding: '8px 12px',
            background: 'var(--bg-hover)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          {refreshMsg}
        </div>
      )}

      {isAdmin && bulkIds.size > 0 && (
        <div
          style={{
            background: 'var(--bg-branded)',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{bulkIds.size} selected</span>
          <select
            aria-label="Bulk change status"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                bulkSetStatus(e.target.value);
                e.target.value = '';
              }
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <option value="" disabled>
              Change status to…
            </option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Bulk reassign"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                bulkReassign(e.target.value === '__none' ? null : e.target.value);
                e.target.value = '';
              }
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <option value="" disabled>
              Reassign to…
            </option>
            <option value="__none">Unassigned</option>
            {assignees
              .filter(a => a !== 'All' && a !== 'Unassigned')
              .map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
          </select>
          <button
            onClick={() => setBulkIds(new Set())}
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length === 0 && (
          <div
            style={{ ...S.card, textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}
          >
            No tickets found.
          </div>
        )}
        {filtered.map(t => {
          const checked = bulkIds.has(t.id);
          const ageDays = Math.floor((Date.now() - new Date(t.updated).getTime()) / 86400000);
          const isStale = ageDays >= 7 && statusCategoryFor(t.status) !== 'done';
          return (
            <div
              key={t.id}
              style={{
                ...S.card,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                borderColor: checked ? 'var(--accent-primary)' : 'var(--border-default)',
              }}
            >
              {isAdmin && (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBulk(t.id)}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Select ticket ${t.id}`}
                  style={{ flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer' }}
                />
              )}
              <button
                onClick={() => setSelectedId(t.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Unread dot: someone else wrote after this user's last read. */}
                  {t.lastMessageAt &&
                    t.lastMessageAuthorEmail &&
                    t.lastMessageAuthorEmail !== currentUser?.email &&
                    (!t.lastReadAt || t.lastMessageAt > t.lastReadAt) && (
                      <span
                        title="New messages"
                        aria-label="Unread messages"
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: 'var(--accent-primary)',
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                    )}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.title}
                  </span>
                  {isAdmin && isStale && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: 'rgba(245, 158, 11, 0.18)',
                        color: '#92400E',
                        fontWeight: 700,
                      }}
                    >
                      Stale {ageDays}d
                    </span>
                  )}
                  {isAdmin && <SlaChip ticket={t} />}
                  {isAdmin && <JiraSyncChip ticket={t} />}
                  <DevChip ticket={t} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t.id} · {t.category} · Updated {t.updated}
                  {isAdmin && t.assignee && <> · 👤 {t.assignee}</>}
                </div>
              </button>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <span style={S.badge(PRIORITY_COLORS[t.priority])}>{t.priority}</span>
                <span
                  style={{
                    ...S.badge(statusColorFor(t.status)),
                    background: statusColorFor(t.status) + '18',
                    color: statusColorFor(t.status),
                  }}
                >
                  {t.status}
                </span>
                <span style={{ color: 'var(--border-strong)', fontSize: '16px' }}>›</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Developer Portal ─────────────────────────────────────────────────────────
// What an engineer sees when they log in: the tickets *assigned to them*,
// ordered by oldest-touched so SLA-at-risk items surface first. Status can be
// changed inline only on tickets where the user is the assignee — gated by
// tickets.status_change_own.
function DeveloperPortalPage({ currentUser }) {
  const can = useCan();
  const [ticketsVersion, setTicketsVersion] = useState(0);
  useEffect(() => subscribeTickets(setTicketsVersion), []);
  const [selectedId, setSelectedId] = useState(null);
  const { addNotification } = useNotifications();

  const tickets = MOCK_TICKETS;
  // Match by assigneeEmail when present (more reliable post-step-5), otherwise
  // fall back to name. Both filters are case-insensitive defensively.
  const mine = useMemo(() => {
    const email = currentUser?.email?.toLowerCase() || '';
    const name = currentUser?.name?.toLowerCase() || '';
    return tickets.filter(t => {
      if (t.assigneeEmail) return t.assigneeEmail.toLowerCase() === email;
      return t.assignee && t.assignee.toLowerCase() === name;
    });
    // ticketsVersion keys the memo because MOCK_TICKETS mutates in place —
    // the array reference alone never changes (same fix as MyTicketsPage).
  }, [tickets, ticketsVersion, currentUser?.email, currentUser?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const open = mine.filter(t => !DONE_STATUSES.has(t.status));
    const inProgress = mine.filter(t => t.status === 'In Progress').length;
    const ages = open.map(t =>
      Math.max(0, (Date.now() - new Date(t.updated || t.created).getTime()) / 86400000)
    );
    const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    return { assigned: mine.length, openCount: open.length, inProgress, avgAge };
  }, [mine]);

  const selected = selectedId ? tickets.find(t => t.id === selectedId) : null;
  const canChangeOwnStatus = can('tickets.status_change_own') || can('tickets.status_change_any');

  const handleStatusChange = (id, newStatus) => {
    const t = MOCK_TICKETS.find(x => x.id === id);
    if (!t) return;
    const prev = t.status;
    t.status = newStatus;
    t.updated = new Date().toISOString().slice(0, 10);
    bumpTickets();
    mirror(t.uuid && ticketsApi.updateTicket(t.uuid, { status: newStatus }));
    recordAudit(
      'ticket.status_change',
      _currentActor,
      { type: 'ticket', id: t.id, label: t.title },
      { from: prev, to: newStatus }
    );
    if (t.jiraKey) pushJiraTransition(t, newStatus).catch(() => {});
    addNotification({
      type: 'status_change',
      title: `Status updated: ${t.id}`,
      body: `${prev} → ${newStatus}`,
      ticketId: t.id,
    });
  };

  const handleAssigneeChange = () => {
    // Developers can't reassign — guard at the call site too.
  };

  if (selected) {
    return (
      <TicketDetail
        ticket={selected}
        onBack={() => setSelectedId(null)}
        currentUser={currentUser}
        role="user"
        onStatusChange={handleStatusChange}
        onAssigneeChange={handleAssigneeChange}
        onAddNotification={addNotification}
        onOpenTicket={setSelectedId}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}
        >
          Developer Portal
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Tickets assigned to you, ordered by oldest activity.
        </div>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: 'Assigned to me', value: stats.assigned, color: 'var(--accent-primary)' },
          { label: 'Currently open', value: stats.openCount, color: '#F59E0B' },
          { label: 'In progress', value: stats.inProgress, color: '#3B82F6' },
          { label: 'Avg age (days)', value: stats.avgAge, color: '#16A34A' },
        ].map(s => (
          <div
            key={s.label}
            style={{ ...S.card, padding: '16px 18px', borderLeft: `4px solid ${s.color}` }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--text-primary)',
                marginTop: '4px',
              }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      {mine.length === 0 ? (
        <div style={{ ...S.card, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            Nothing assigned to you
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            When tickets are routed to {currentUser?.name || 'you'}, they'll appear here.
          </div>
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr 200px 110px 140px 80px',
              padding: '10px 14px',
              background: 'var(--bg-page)',
              borderBottom: '1px solid var(--border-default)',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span>Ticket</span>
            <span>Title</span>
            <span>Requester</span>
            <span>Priority</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Age</span>
          </div>
          {[...mine]
            .sort((a, b) => (a.updated || '').localeCompare(b.updated || ''))
            .map(t => {
              const ageDays = Math.floor(
                (Date.now() - new Date(t.updated || t.created).getTime()) / 86400000
              );
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 200px 110px 140px 80px',
                    alignItems: 'center',
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.id}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '12px',
                    }}
                  >
                    {t.title}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '12px',
                    }}
                  >
                    {t.requester?.name || '—'}
                  </span>
                  <span
                    style={{
                      ...S.badge(PRIORITY_COLORS[t.priority] || '#64748B'),
                      fontSize: '11px',
                    }}
                  >
                    {t.priority}
                  </span>
                  <span
                    style={{
                      ...S.badge(statusColorFor(t.status)),
                      background: statusColorFor(t.status) + '18',
                      color: statusColorFor(t.status),
                      fontSize: '11px',
                    }}
                  >
                    {t.status}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: ageDays > 7 ? '#DC2626' : 'var(--text-muted)',
                      fontWeight: 600,
                      textAlign: 'right',
                    }}
                  >
                    {ageDays}d
                  </span>
                </button>
              );
            })}
          {!canChangeOwnStatus && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--bg-page)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              Status changes are managed by the IT team — open a ticket to view its detail.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin Console ────────────────────────────────────────────────────────────
function AdminPage({ setSection }) {
  const [, _setTicketsVersion] = useState(0);
  useEffect(() => subscribeTickets(_setTicketsVersion), []);
  const tickets = MOCK_TICKETS;

  const totalOpen = tickets.filter(t => statusCategoryFor(t.status) === 'new').length;
  const totalCritical = tickets.filter(
    t => t.priority === 'Critical' && statusCategoryFor(t.status) !== 'done'
  ).length;
  const totalActive = tickets.filter(t => statusCategoryFor(t.status) !== 'done').length;

  return (
    <div>
      {/* System health + maintenance toggle (admin only — gates own access) */}
      <div
        className="pomelo-stack-on-mobile"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <SystemHealthCard />
        <MaintenanceToggleCard />
      </div>

      {/* Admin header banner — ticket work now lives on the Board */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--bg-branded) 0%, var(--bg-branded-2) 100%)',
          borderRadius: '14px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 800 }}>Admin Console</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', marginTop: '2px' }}>
            System health &amp; controls · ticket management moved to the Board
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
          {[
            [totalOpen, 'Open', '#818CF8'],
            [totalCritical, 'Critical Active', '#F87171'],
            [totalActive, 'Active', '#FBBF24'],
            [tickets.length, 'Total', '#fff'],
          ].map(([num, label, color]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ color, fontSize: '20px', fontWeight: 900 }}>{num}</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px' }}>{label}</div>
            </div>
          ))}
          <button
            onClick={() => setSection?.('board')}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Open Board →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Roles & Access page (admin only) ────────────────────────────────────────
// One page that owns everything role-related: settings strip, the role
// registry CRUD, the capability matrix, bulk role reassignment, and user
// creation. Mutations route through the role API helpers so the same safety
// rules apply whether they're triggered from this UI, a future settings page,
// or a script.
function RolesAccessPage({ currentUserEmail }) {
  const can = useCan();
  const roles = useRoles();
  const { settings } = useRbacCtx();
  const [, _setUsersVersion] = useState(0);
  useEffect(() => subscribeUsers(_setUsersVersion), []);
  const allUsers = listUsers();

  // Selected role on the right pane. Defaults to first non-system or, if all
  // roles are system, the first system role.
  const [selectedId, setSelectedId] = useState(() => roles[0]?.id || null);
  useEffect(() => {
    if (!selectedId || !roles.find(r => r.id === selectedId)) setSelectedId(roles[0]?.id || null);
  }, [roles, selectedId]);
  const selected = roles.find(r => r.id === selectedId) || null;

  // Buffered edits to the selected role. We commit on Save so a partial edit
  // doesn't trip the lockout guard mid-toggle.
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    setDraft(
      selected
        ? {
            label: selected.label,
            description: selected.description || '',
            color: selected.color || '#6366F1',
            capabilities: selected.capabilities.slice(),
          }
        : null
    );
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!(
    selected &&
    draft &&
    (draft.label !== selected.label ||
      draft.description !== (selected.description || '') ||
      draft.color !== (selected.color || '#6366F1') ||
      draft.capabilities.length !== selected.capabilities.length ||
      draft.capabilities.some(c => !selected.capabilities.includes(c)))
  );

  // Modal state
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState(null); // role object
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => setToast({ message: msg, type });

  // ─── Settings strip — default assignee ──────────────────────────────────────
  const [settingsDraft, setSettingsDraft] = useState({
    defaultAssigneeName: settings.defaultAssigneeName,
    defaultAssigneeEmail: settings.defaultAssigneeEmail,
  });
  useEffect(() => {
    setSettingsDraft({
      defaultAssigneeName: settings.defaultAssigneeName,
      defaultAssigneeEmail: settings.defaultAssigneeEmail,
    });
  }, [settings.defaultAssigneeName, settings.defaultAssigneeEmail]);
  const settingsDirty =
    settingsDraft.defaultAssigneeName !== settings.defaultAssigneeName ||
    settingsDraft.defaultAssigneeEmail !== settings.defaultAssigneeEmail;
  const saveSettings = () => {
    const email = settingsDraft.defaultAssigneeEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Default assignee email looks invalid.', 'error');
      return;
    }
    updateSettings({
      defaultAssigneeName: settingsDraft.defaultAssigneeName.trim(),
      defaultAssigneeEmail: email,
    });
    showToast('Default assignee updated.');
  };

  // ─── Save role edits ────────────────────────────────────────────────────────
  const saveRole = () => {
    if (!selected || !draft) return;
    const res = updateRole(selected.id, draft);
    if (res?.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(`Role "${draft.label}" saved.`);
  };

  // ─── Capability toggle (in the draft, not committed) ────────────────────────
  const toggleCap = capId => {
    if (!draft) return;
    // Superadmin is locked — every capability stays on.
    if (selected?.id === 'role_superadmin') {
      showToast('Superadmin must retain every capability.', 'error');
      return;
    }
    setDraft(d => ({
      ...d,
      capabilities: d.capabilities.includes(capId)
        ? d.capabilities.filter(c => c !== capId)
        : [...d.capabilities, capId],
    }));
  };

  // ─── Delete role ────────────────────────────────────────────────────────────
  const doDeleteRole = () => {
    if (!deleteRoleConfirm) return;
    const res = deleteRole(deleteRoleConfirm.id);
    setDeleteRoleConfirm(null);
    if (res?.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(`Role "${deleteRoleConfirm.label}" deleted.`);
  };

  const groupedCaps = useMemo(() => {
    const groups = {};
    for (const c of CAPABILITIES) {
      (groups[c.group] = groups[c.group] || []).push(c);
    }
    return groups;
  }, []);

  // Capabilities matrix needs roles.edit; users-in-role table needs
  // roles.assign; create user needs users.create. Page itself is already
  // gated by roles.edit at the route level.
  const canEditRoles = can('roles.edit');
  const canCreateRole = can('roles.create');
  const canDeleteRole = can('roles.delete');
  const canAssignRole = can('roles.assign');
  const canCreateUser = can('users.create');
  const canEditSettings = can('system.settings_edit');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}
        >
          Roles & Access
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Define what each role can do, assign users, and create new portal accounts.
        </div>
      </div>

      {/* Settings strip — default assignee */}
      <div
        style={{
          ...S.card,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '14px',
          borderLeft: '4px solid var(--accent-primary)',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginRight: '8px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Default ticket assignee
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Every new ticket lands here for triage before admin re-routes.
          </div>
        </div>
        <input
          type="text"
          value={settingsDraft.defaultAssigneeName}
          onChange={e => setSettingsDraft(d => ({ ...d, defaultAssigneeName: e.target.value }))}
          placeholder="Display name"
          disabled={!canEditSettings}
          style={{ ...S.input, flex: '1 1 180px', minWidth: '160px', maxWidth: '260px' }}
        />
        <input
          type="email"
          value={settingsDraft.defaultAssigneeEmail}
          onChange={e => setSettingsDraft(d => ({ ...d, defaultAssigneeEmail: e.target.value }))}
          placeholder="email@pomelofashion.com"
          disabled={!canEditSettings}
          style={{ ...S.input, flex: '1 1 260px', minWidth: '220px', maxWidth: '360px' }}
        />
        <button
          onClick={saveSettings}
          disabled={!canEditSettings || !settingsDirty}
          style={{
            ...S.orangeBtn,
            opacity: canEditSettings && settingsDirty ? 1 : 0.45,
            cursor: canEditSettings && settingsDirty ? 'pointer' : 'not-allowed',
          }}
        >
          Save
        </button>
      </div>

      {/* Two-column body: roles list (left) + role detail (right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          gap: '18px',
          alignItems: 'start',
        }}
      >
        {/* Left rail — role list */}
        <div
          style={{
            ...S.card,
            padding: '14px 14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Roles
            </div>
            <button
              onClick={() => setCreateRoleOpen(true)}
              disabled={!canCreateRole}
              style={{
                padding: '5px 10px',
                background: 'var(--accent-soft)',
                color: 'var(--accent-primary)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: canCreateRole ? 'pointer' : 'not-allowed',
                opacity: canCreateRole ? 1 : 0.45,
              }}
              title={
                canCreateRole ? 'Define a new role' : 'You do not have permission to create roles.'
              }
            >
              + New role
            </button>
          </div>
          {roles.map(r => {
            const count = countUsersInRole(r.id);
            const isActive = selectedId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: r.color || 'var(--accent-primary)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.label}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {r.capabilities.length} caps · {count} {count === 1 ? 'user' : 'users'}
                    </span>
                  </span>
                </span>
                {r.isSystem && (
                  <span
                    title="System role (cannot be deleted)"
                    style={{ fontSize: '10px', color: 'var(--text-muted)' }}
                  >
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right pane — selected role detail */}
        {!selected ? (
          <div
            style={{ ...S.card, padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}
          >
            Select a role to view or edit its capabilities.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Role header */}
            <div style={S.card}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: draft?.color || selected.color,
                    flexShrink: 0,
                  }}
                />
                <input
                  type="text"
                  value={draft?.label || ''}
                  onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                  disabled={!canEditRoles}
                  style={{ ...S.input, fontSize: '16px', fontWeight: 700, flex: 1 }}
                  placeholder="Role label"
                />
                <input
                  type="color"
                  value={draft?.color || '#6366F1'}
                  onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                  disabled={!canEditRoles}
                  title="Role color"
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    cursor: canEditRoles ? 'pointer' : 'not-allowed',
                    background: 'var(--bg-input)',
                  }}
                />
                {selected.isSystem && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    System
                  </span>
                )}
              </div>
              <textarea
                value={draft?.description || ''}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                disabled={!canEditRoles}
                rows={2}
                placeholder="Short description shown to admins managing this role."
                style={{ ...S.textarea, minHeight: '54px', fontSize: '13px' }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '12px',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selected.isSystem
                    ? 'Machine name locked for system roles.'
                    : `Machine name: ${selected.name}`}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!selected.isSystem && (
                    <button
                      onClick={() => setDeleteRoleConfirm(selected)}
                      disabled={!canDeleteRole}
                      style={{
                        padding: '8px 14px',
                        background: 'transparent',
                        color: '#DC2626',
                        border: '1px solid #FCA5A5',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: canDeleteRole ? 'pointer' : 'not-allowed',
                        opacity: canDeleteRole ? 1 : 0.45,
                      }}
                    >
                      Delete role
                    </button>
                  )}
                  <button
                    onClick={saveRole}
                    disabled={!canEditRoles || !dirty}
                    style={{
                      ...S.orangeBtn,
                      opacity: canEditRoles && dirty ? 1 : 0.45,
                      cursor: canEditRoles && dirty ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </div>

            {/* Capability matrix */}
            <div style={S.card}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Capabilities
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {draft?.capabilities.length || 0} of {CAPABILITIES.length} granted
                </div>
              </div>
              {Object.entries(groupedCaps).map(([group, caps]) => (
                <div key={group} style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: '6px',
                    }}
                  >
                    {group}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '6px',
                    }}
                  >
                    {caps.map(c => {
                      const checked = draft?.capabilities.includes(c.id) || false;
                      const lockedSuperadmin = selected.id === 'role_superadmin';
                      const disabled = !canEditRoles || lockedSuperadmin;
                      return (
                        <label
                          key={c.id}
                          title={c.description}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: checked ? 'var(--accent-soft)' : 'var(--bg-page)',
                            border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled && !lockedSuperadmin ? 0.6 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleCap(c.id)}
                            style={{
                              marginTop: '2px',
                              accentColor: 'var(--accent-primary)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {c.label}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {c.id}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {selected.id === 'role_superadmin' && (
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    marginTop: '4px',
                  }}
                >
                  Superadmin is locked to every capability to prevent admin lockout.
                </div>
              )}
            </div>

            {/* Users in this role */}
            <UsersInRoleSection
              role={selected}
              users={allUsers.filter(u => u.roleId === selected.id)}
              allRoles={roles}
              canAssign={canAssignRole}
              currentUserEmail={currentUserEmail}
              onToast={showToast}
            />
          </div>
        )}
      </div>

      {/* Create user card */}
      <CreateUserOnRolesPage roles={roles} canCreate={canCreateUser} onToast={showToast} />

      {createRoleOpen && (
        <CreateRoleModal
          groupedCaps={groupedCaps}
          onClose={() => setCreateRoleOpen(false)}
          onCreated={role => {
            setCreateRoleOpen(false);
            setSelectedId(role.id);
            showToast(`Role "${role.label}" created.`);
          }}
          onToast={showToast}
        />
      )}

      {deleteRoleConfirm && (
        <ConfirmRoleDeleteModal
          role={deleteRoleConfirm}
          userCount={countUsersInRole(deleteRoleConfirm.id)}
          onCancel={() => setDeleteRoleConfirm(null)}
          onConfirm={doDeleteRole}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── Roles & Access sub-components ───────────────────────────────────────────

function UsersInRoleSection({ role, users, allRoles, canAssign, currentUserEmail, onToast }) {
  const [bulkIds, setBulkIds] = useState(new Set());
  const [targetRoleId, setTargetRoleId] = useState('');
  useEffect(() => setBulkIds(new Set()), [role.id]);
  const toggleBulk = id =>
    setBulkIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const otherRoles = allRoles.filter(r => r.id !== role.id);

  const doBulkReassign = () => {
    if (!targetRoleId || bulkIds.size === 0) return;
    let failed = 0;
    let succeeded = 0;
    for (const userId of bulkIds) {
      const res = setUserRoleId(userId, targetRoleId);
      if (res?.error) {
        failed++;
        onToast(res.error, 'error');
      } else succeeded++;
    }
    if (succeeded) onToast(`Reassigned ${succeeded} ${succeeded === 1 ? 'user' : 'users'}.`);
    if (!failed) {
      setBulkIds(new Set());
      setTargetRoleId('');
    }
  };

  return (
    <div style={S.card}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Users in this role ({users.length})
        </div>
        {bulkIds.size > 0 && canAssign && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {bulkIds.size} selected →
            </span>
            <select
              value={targetRoleId}
              onChange={e => setTargetRoleId(e.target.value)}
              style={{ ...S.select, width: 'auto', padding: '6px 10px', fontSize: '12px' }}
            >
              <option value="">Reassign to…</option>
              {otherRoles.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              onClick={doBulkReassign}
              disabled={!targetRoleId}
              style={{
                padding: '6px 12px',
                background: 'var(--accent-primary)',
                color: 'var(--text-inverse)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: targetRoleId ? 'pointer' : 'not-allowed',
                opacity: targetRoleId ? 1 : 0.45,
              }}
            >
              Apply
            </button>
          </div>
        )}
      </div>
      {users.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No users hold this role yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {users.map(u => {
            const isSelf = u.email === currentUserEmail;
            return (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 4px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                {canAssign ? (
                  <input
                    type="checkbox"
                    checked={bulkIds.has(u.id)}
                    onChange={() => toggleBulk(u.id)}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                ) : (
                  <span style={{ width: '14px' }} />
                )}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: role.color || 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  {u.name
                    .split(' ')
                    .map(p => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {u.name}
                    {isSelf && (
                      <span
                        style={{
                          marginLeft: '6px',
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-primary)',
                          fontWeight: 700,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {u.email} · {u.department}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    color: u.active ? 'var(--text-secondary)' : '#DC2626',
                    fontWeight: 700,
                  }}
                >
                  {u.active ? 'Active' : 'Deactivated'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateUserOnRolesPage({ roles, canCreate, onToast }) {
  // Persist the non-sensitive fields as a draft; the temp password is kept in
  // plain state only (never written to localStorage).
  const defaultRoleId = () => roles.find(r => r.isDefault)?.id || roles[0]?.id || '';
  const [draft, setDraft, clearDraft] = usePersistentState('user-create', () => ({
    name: '',
    email: '',
    department: 'IT & Technology',
    roleId: defaultRoleId(),
  }));
  const { name, email, department, roleId } = draft;
  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const [tempPassword, setTempPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If the previously-selected role disappears (admin deleted it), fall
    // back to the registry's default role.
    if (!roles.find(r => r.id === roleId)) {
      setField('roleId', defaultRoleId());
    }
  }, [roles, roleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await adminCreateUser({ name, email, roleId, department, tempPassword });
    setBusy(false);
    if (res.error) {
      onToast(res.error, 'error');
      return;
    }
    onToast(`Created user ${res.user.name}.`);
    clearDraft();
    setTempPassword('');
  };

  return (
    <form
      onSubmit={submit}
      style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Create user
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          The user receives the temp password and is asked to change it on first login.
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        <div>
          <label style={S.label}>Full name</label>
          <input
            value={name}
            onChange={e => setField('name', e.target.value)}
            disabled={!canCreate}
            required
            style={S.input}
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label style={S.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setField('email', e.target.value)}
            disabled={!canCreate}
            required
            style={S.input}
            placeholder="jane.doe@pomelo.com"
          />
        </div>
        <div>
          <label style={S.label}>Department</label>
          <input
            value={department}
            onChange={e => setField('department', e.target.value)}
            disabled={!canCreate}
            style={S.input}
          />
        </div>
        <div>
          <label style={S.label}>Role</label>
          <select
            value={roleId}
            onChange={e => setField('roleId', e.target.value)}
            disabled={!canCreate}
            style={S.select}
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Temp password</label>
          <input
            type="text"
            value={tempPassword}
            onChange={e => setTempPassword(e.target.value)}
            disabled={!canCreate}
            required
            minLength={8}
            style={S.input}
            placeholder="At least 8 characters"
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={!canCreate || busy}
          style={{
            ...S.orangeBtn,
            opacity: canCreate && !busy ? 1 : 0.45,
            cursor: canCreate && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function CreateRoleModal({ groupedCaps, onClose, onCreated, onToast }) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [capabilities, setCapabilities] = useState([]);
  const toggleCap = id =>
    setCapabilities(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

  const submit = e => {
    e.preventDefault();
    const res = createRole({ name: label, label, description, color, capabilities });
    if (res?.error) {
      onToast(res.error, 'error');
      return;
    }
    onCreated(res);
  };

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create role"
        style={{
          width: '640px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            New role
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          style={{
            padding: '18px 22px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Role label</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. QA Engineer"
                required
                style={S.input}
              />
            </div>
            <div>
              <label style={S.label}>Color</label>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{
                  width: '46px',
                  height: '38px',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'var(--bg-input)',
                }}
              />
            </div>
          </div>
          <div>
            <label style={S.label}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description shown to admins managing this role."
              style={{ ...S.textarea, minHeight: '54px', fontSize: '13px' }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Capabilities ({capabilities.length} selected)
            </div>
            {Object.entries(groupedCaps).map(([group, caps]) => (
              <div key={group} style={{ marginBottom: '10px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '4px',
                  }}
                >
                  {group}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '4px',
                  }}
                >
                  {caps.map(c => (
                    <label
                      key={c.id}
                      title={c.description}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={capabilities.includes(c.id)}
                        onChange={() => toggleCap(c.id)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      <span style={{ minWidth: 0 }}>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button type="button" onClick={onClose} style={S.ghostBtn}>
            Cancel
          </button>
          <button type="submit" style={S.orangeBtn}>
            Create role
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmRoleDeleteModal({ role, userCount, onCancel, onConfirm }) {
  const blocked = userCount > 0;
  return (
    <div
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '440px',
          maxWidth: '95vw',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          Delete role "{role.label}"?
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
          {blocked
            ? `This role still has ${userCount} ${userCount === 1 ? 'user' : 'users'}. Reassign them first.`
            : 'This cannot be undone. Capability assignments on this role will be lost.'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onCancel} style={S.ghostBtn}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked}
            style={{
              padding: '9px 18px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: blocked ? 'not-allowed' : 'pointer',
              opacity: blocked ? 0.5 : 1,
            }}
          >
            Delete role
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Users panel (admin only) ─────────────────────────────────────────────────
function UsersPanelPage({ currentUserEmail }) {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeUsers(setVersion), []);

  const [query, setQuery] = usePersistentState('users-query', '');
  const [roleFilter, setRoleFilter] = usePersistentState('users-role', 'all');
  const [statusFilter, setStatusFilter] = usePersistentState('users-status', 'all');
  const [editing, setEditing] = useState(null); // user object being edited
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null); // user object whose password is being reset
  const [confirm, setConfirm] = useState(null); // { action, user, message }

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listUsers().filter(u => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q))
        return false;
      if (roleFilter !== 'all' && u.roleId !== roleFilter) return false;
      if (statusFilter === 'active' && !u.active) return false;
      if (statusFilter === 'deactivated' && u.active) return false;
      if (statusFilter === 'never-logged-in' && u.lastLoginAt) return false;
      return true;
    });
  }, [query, roleFilter, statusFilter, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTicketCount = name =>
    MOCK_TICKETS.filter(t => t.assignee === name && statusCategoryFor(t.status) !== 'done').length;

  const fmtLogin = iso => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toISOString().slice(0, 10);
  };

  const StatusChip = ({ user }) => {
    if (!user.active)
      return (
        <span
          style={{
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'rgba(220, 38, 38, 0.18)',
            color: '#B91C1C',
            fontWeight: 700,
          }}
        >
          Deactivated
        </span>
      );
    if (!user.lastLoginAt)
      return (
        <span
          style={{
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.18)',
            color: '#92400E',
            fontWeight: 700,
          }}
        >
          Never logged in
        </span>
      );
    return (
      <span
        style={{
          fontSize: '11px',
          padding: '3px 8px',
          borderRadius: '4px',
          background: 'rgba(22, 163, 74, 0.18)',
          color: '#15803D',
          fontWeight: 700,
        }}
      >
        Active
      </span>
    );
  };

  const [actionError, setActionError] = useState('');
  const handleConfirmed = () => {
    if (!confirm) return;
    const { action, user, message } = confirm;
    setActionError('');
    if (action === 'changeRole') {
      const res = setUserRoleId(user.id, message.roleId);
      if (res?.error) {
        setActionError(res.error);
        return;
      }
    } else if (action === 'promote') setUserRole(user.id, 'superadmin');
    else if (action === 'demote') setUserRole(user.id, 'user');
    else if (action === 'deactivate') setUserActive(user.id, false);
    else if (action === 'reactivate') setUserActive(user.id, true);
    else if (action === 'forceOtp') forceUserReOtp(user.id);
    setConfirm(null);
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}
          >
            Users
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage portal accounts, roles, and access.
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          + New user
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search by name or email…"
          aria-label="Search users"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: '200px',
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            outline: 'none',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All roles</option>
          {listRoles().map(r => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="never-logged-in">Never logged in</option>
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)', textAlign: 'left' }}>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  User
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Role
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Department
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Last login
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textAlign: 'right',
                  }}
                >
                  Open tickets
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.email === currentUserEmail;
                const userRole = findRole(u.roleId);
                const roleColor = userRole?.color || 'var(--text-muted)';
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: roleColor,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12px',
                          }}
                        >
                          {u.name
                            .split(' ')
                            .map(p => p[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {u.name}{' '}
                            {isSelf && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  fontWeight: 500,
                                }}
                              >
                                (you)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: (roleColor || 'var(--text-muted)') + '18',
                          color: roleColor,
                          fontWeight: 700,
                        }}
                      >
                        {userRole?.label || u.role || 'Unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                      {u.department}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                      }}
                    >
                      {fmtLogin(u.lastLoginAt)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusChip user={u} />
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        textAlign: 'right',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {openTicketCount(u.name)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <UserRowActions
                        user={u}
                        isSelf={isSelf}
                        onEdit={() => setEditing(u)}
                        onResetPassword={() => setResetting(u)}
                        onConfirm={(action, message) => setConfirm({ action, user: u, message })}
                      />
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    No users match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {creating && <UserCreateModal onClose={() => setCreating(false)} />}
      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          currentUserEmail={currentUserEmail}
        />
      )}
      {resetting && <UserResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.message.title}
          body={
            <>
              {confirm.message.body}
              {actionError && (
                <div
                  role="alert"
                  style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(220, 38, 38, 0.10)',
                    color: '#B91C1C',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  {actionError}
                </div>
              )}
            </>
          }
          confirmLabel={confirm.message.confirmLabel}
          confirmStyle={confirm.message.danger ? 'danger' : 'primary'}
          onConfirm={handleConfirmed}
          onCancel={() => {
            setConfirm(null);
            setActionError('');
          }}
        />
      )}
    </div>
  );
}

function UserRowActions({ user, isSelf, onEdit, onResetPassword, onConfirm }) {
  const can = useCan();
  const roles = useRoles();
  const [open, setOpen] = useState(false);
  const [roleSubOpen, setRoleSubOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDown = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setRoleSubOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const canEdit = can('users.edit');
  const canChangeRole = can('roles.assign');

  const item = (label, onClick, opts = {}) => (
    <button
      key={label}
      role="menuitem"
      onClick={() => {
        setOpen(false);
        setRoleSubOpen(false);
        onClick();
      }}
      disabled={opts.disabled}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        border: 'none',
        background: 'none',
        color: opts.danger ? '#B91C1C' : 'var(--text-primary)',
        cursor: opts.disabled ? 'not-allowed' : 'pointer',
        fontSize: '13px',
        borderRadius: '6px',
        opacity: opts.disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  const currentRole = roles.find(r => r.id === user.roleId);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Actions for ${user.name}`}
        aria-expanded={open}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-secondary)',
        }}
      >
        Actions ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '220px',
            background: 'var(--bg-surface)',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            padding: '4px',
            zIndex: 100,
            textAlign: 'left',
          }}
        >
          {item('Edit details & role', onEdit, { disabled: !canEdit && !canChangeRole })}

          {/* Change role submenu — replaces the binary promote/demote item.
              Any role from the registry is a valid target. Selecting the
              user's current role is a no-op (disabled). */}
          <div style={{ position: 'relative' }}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={roleSubOpen}
              onClick={() => setRoleSubOpen(o => !o)}
              disabled={!canChangeRole}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                background: 'none',
                color: 'var(--text-primary)',
                cursor: canChangeRole ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: canChangeRole ? 1 : 0.5,
              }}
            >
              <span>Change role…</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {roleSubOpen ? '▾' : '▸'}
              </span>
            </button>
            {roleSubOpen && canChangeRole && (
              <div
                role="menu"
                style={{
                  marginLeft: '12px',
                  marginTop: '2px',
                  marginBottom: '4px',
                  borderLeft: '2px solid var(--border-subtle)',
                  paddingLeft: '4px',
                }}
              >
                {roles.map(r => {
                  const isCurrent = r.id === user.roleId;
                  return (
                    <button
                      key={r.id}
                      role="menuitem"
                      disabled={isCurrent}
                      onClick={() => {
                        setOpen(false);
                        setRoleSubOpen(false);
                        onConfirm('changeRole', {
                          title: `Change ${user.name}'s role to ${r.label}?`,
                          body: `${user.name} will take on every capability granted to "${r.label}" and lose anything that's not in that role.${isSelf ? ' This is your own account — the last-admin guard will block a change that locks out role management.' : ''}`,
                          confirmLabel: `Change to ${r.label}`,
                          danger: false,
                          roleId: r.id,
                        });
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '7px 10px',
                        border: 'none',
                        background: 'none',
                        color: isCurrent ? 'var(--text-muted)' : 'var(--text-primary)',
                        cursor: isCurrent ? 'default' : 'pointer',
                        fontSize: '12px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: r.color || 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1 }}>{r.label}</span>
                      {isCurrent && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          current
                        </span>
                      )}
                    </button>
                  );
                })}
                {currentRole?.isSystem && currentRole.id === 'role_superadmin' && (
                  <div
                    style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 10px' }}
                  >
                    Demoting a superadmin reduces their access immediately.
                  </div>
                )}
              </div>
            )}
          </div>

          {item('Reset password', onResetPassword)}
          {item('Force re-OTP on next login', () =>
            onConfirm('forceOtp', {
              title: 'Force re-OTP?',
              body: `${user.name} will be required to re-verify via OTP on their next login.`,
              confirmLabel: 'Force re-OTP',
            })
          )}
          {!isSelf &&
            item(
              user.active ? 'Deactivate account' : 'Reactivate account',
              () =>
                onConfirm(user.active ? 'deactivate' : 'reactivate', {
                  title: user.active ? 'Deactivate this account?' : 'Reactivate this account?',
                  body: user.active
                    ? `${user.name} will be blocked from logging in until reactivated.`
                    : `${user.name} will be able to log in again.`,
                  confirmLabel: user.active ? 'Deactivate' : 'Reactivate',
                  danger: user.active,
                }),
              { danger: user.active }
            )}
        </div>
      )}
    </div>
  );
}

function UserCreateModal({ onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('IT & Technology');
  const [role, setRole] = useState('user');
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = async e => {
    e.preventDefault();
    const res = await adminCreateUser({ name, email, role, department, tempPassword });
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 500 }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Create user"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          zIndex: 501,
          width: '480px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Create user
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={submit}
          style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <FormField label="Full name">
            <input
              aria-label="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Email">
            <input
              aria-label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Department">
            <input
              aria-label="Department"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Role">
            <select
              aria-label="Role"
              value={role}
              onChange={e => setRole(e.target.value)}
              style={inputStyle}
            >
              <option value="user">User</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </FormField>
          <FormField
            label="Temporary password"
            hint="At least 8 characters. User must change it on first login."
          >
            <input
              aria-label="Temporary password"
              type="text"
              value={tempPassword}
              onChange={e => setTempPassword(e.target.value)}
              style={inputStyle}
            />
          </FormField>
          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(220, 38, 38, 0.10)',
                color: '#B91C1C',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}
          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}
          >
            <button type="button" onClick={onClose} style={ghostBtn}>
              Cancel
            </button>
            <button type="submit" style={primaryBtn}>
              Create
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function UserEditModal({ user, onClose, currentUserEmail }) {
  const can = useCan();
  const roles = useRoles();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [department, setDepartment] = useState(user.department);
  const [roleId, setRoleId] = useState(user.roleId || '');
  const [error, setError] = useState('');
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);

  const canEditProfile = can('users.edit');
  const canChangeRole = can('roles.assign');
  const isSelf = user.email === currentUserEmail;

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = e => {
    e.preventDefault();
    setError('');
    // Update profile fields first.
    if (canEditProfile) {
      updateUser(user.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        department: department.trim(),
      });
    }
    // Then role, separately — the role mutator runs its own last-admin guard
    // and surfaces a clean error if the change would lock the actor out.
    if (canChangeRole && roleId && roleId !== user.roleId) {
      const res = setUserRoleId(user.id, roleId);
      if (res?.error) {
        setError(res.error);
        return;
      }
    }
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 500 }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${user.name}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          zIndex: 501,
          width: '460px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Edit user
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={submit}
          style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <FormField label="Full name">
            <input
              aria-label="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!canEditProfile}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Email">
            <input
              aria-label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={!canEditProfile}
              style={inputStyle}
            />
          </FormField>
          <FormField label="Department">
            <input
              aria-label="Department"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              disabled={!canEditProfile}
              style={inputStyle}
            />
          </FormField>
          <FormField label={isSelf ? 'Role (your own role)' : 'Role'}>
            <select
              aria-label="Role"
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              disabled={!canChangeRole}
              style={inputStyle}
            >
              {roles.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {!canChangeRole && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Requires the roles.assign capability.
              </div>
            )}
            {isSelf && canChangeRole && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Changing your own role takes effect immediately. The last-admin guard will block a
                change that locks out role management.
              </div>
            )}
          </FormField>
          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(220, 38, 38, 0.10)',
                color: '#B91C1C',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={ghostBtn}>
              Cancel
            </button>
            <button type="submit" disabled={!canEditProfile && !canChangeRole} style={primaryBtn}>
              Save
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function UserResetPasswordModal({ user, onClose }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const panelRef = useRef(null);
  useModalFocusTrap(panelRef);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = async e => {
    e.preventDefault();
    if (pw.length < 8) {
      setError('Temp password must be at least 8 characters.');
      return;
    }
    await resetUserPassword(user.id, pw);
    setDone(true);
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 500 }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Reset password for ${user.name}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          zIndex: 501,
          width: '440px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-default)' }}>
          <h2
            style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Reset password — {user.name}
          </h2>
        </div>
        {done ? (
          <div style={{ padding: '20px 22px' }}>
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(16, 185, 129, 0.10)',
                color: '#065F46',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '12px',
              }}
            >
              ✓ Password reset. Share this temp password with {user.name} via a secure channel. They
              will be prompted to re-verify via OTP on next login.
            </div>
            <div
              style={{
                background: 'var(--bg-page)',
                padding: '12px 14px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '14px',
                color: 'var(--text-primary)',
                wordBreak: 'break-all',
              }}
            >
              {pw}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button onClick={onClose} style={primaryBtn}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <FormField
              label="New temporary password"
              hint="At least 8 characters. User must change on next login."
            >
              <input
                aria-label="Temporary password"
                type="text"
                value={pw}
                onChange={e => setPw(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </FormField>
            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(220, 38, 38, 0.10)',
                  color: '#B91C1C',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={ghostBtn}>
                Cancel
              </button>
              <button type="submit" style={primaryBtn}>
                Reset
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

// Radix AlertDialog — destructive-action confirmation with full a11y, focus
// trap, ESC and click-outside handling for free.
function ConfirmDialog({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  const confirmBg = confirmStyle === 'danger' ? '#B91C1C' : 'var(--accent-primary)';
  return (
    <AlertDialog.Root
      open
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg-overlay)',
            zIndex: 600,
            animation: 'radixIn 150ms cubic-bezier(0.16,1,0.3,1)',
          }}
        />
        <AlertDialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-xl)',
            zIndex: 601,
            width: '440px',
            maxWidth: '95vw',
            boxShadow: 'var(--shadow-modal)',
            overflow: 'hidden',
            outline: 'none',
            fontFamily: "'Inter', sans-serif",
            animation: 'radixIn 180ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div style={{ padding: '22px 24px 4px' }}>
            <AlertDialog.Title
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description
              style={{
                marginTop: '8px',
                color: 'var(--text-secondary)',
                fontSize: '13.5px',
                lineHeight: 1.55,
              }}
            >
              {body}
            </AlertDialog.Description>
          </div>
          <div
            style={{
              padding: '16px 24px 20px',
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
            }}
          >
            <AlertDialog.Cancel asChild>
              <button onClick={onCancel} style={ghostBtn}>
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button onClick={onConfirm} style={{ ...primaryBtn, background: confirmBg }}>
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const FormField = ({ label, hint, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
    {children}
    {hint && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{hint}</span>}
  </label>
);

const inputStyle = {
  padding: '10px 14px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  fontSize: '13px',
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
};
const ghostBtn = {
  padding: '9px 16px',
  background: 'var(--bg-hover)',
  color: 'var(--text-secondary)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
};
const primaryBtn = {
  padding: '9px 18px',
  background: 'var(--accent-primary)',
  color: 'var(--text-inverse)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
};

// ─── System health card (admin only) ──────────────────────────────────────────
function SystemHealthCard() {
  const [state, setState] = useState({
    loading: true,
    ok: false,
    jira: false,
    anthropic: false,
    ts: null,
  });
  const webhook = useWebhookState();
  const workflow = useJiraWorkflow();
  const assignable = useAssignableUsers();

  const refresh = async () => {
    try {
      const res = await fetch('/api/v1/admin-status');
      if (!res.ok) throw new Error('http ' + res.status);
      const d = await res.json();
      setState({ loading: false, ok: true, jira: d.jira, anthropic: d.anthropic, ts: d.ts });
    } catch {
      setState({ loading: false, ok: false, jira: false, anthropic: false, ts: null });
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const dot = active => ({
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active ? '#16A34A' : '#DC2626',
    marginRight: '8px',
  });
  const amber = {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#F59E0B',
    marginRight: '8px',
  };
  const webhookFresh =
    webhook.lastWebhookAt && Date.now() - new Date(webhook.lastWebhookAt).getTime() < 5 * 60_000;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        padding: '16px 18px',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          System health
        </div>
        <button
          onClick={refresh}
          aria-label="Refresh system health"
          style={{
            fontSize: '11px',
            padding: '4px 10px',
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ↻ Refresh
        </button>
      </div>
      {state.loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Checking…</div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={dot(state.ok)} />
            BFF proxy {state.ok ? 'reachable' : 'unreachable'}
          </li>
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={dot(state.ok && state.jira)} />
            Jira integration {state.ok && state.jira ? 'configured' : 'not configured'}
          </li>
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={dot(state.ok && state.anthropic)} />
            Anthropic API {state.ok && state.anthropic ? 'configured' : 'not configured'}
          </li>
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={webhook.lastWebhookAt ? (webhookFresh ? dot(true) : amber) : dot(false)} />
            Webhooks{' '}
            {webhook.lastWebhookAt
              ? `(last ${new Date(webhook.lastWebhookAt).toLocaleTimeString()})`
              : 'never received'}
          </li>
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={dot(workflow.source !== 'fallback')} />
            Workflow{' '}
            {workflow.source === 'fallback'
              ? 'using fallback'
              : `live (${workflow.statuses.length} statuses)`}
          </li>
          <li style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={dot(assignable.source !== 'fallback' && assignable.users.length > 0)} />
            Assignable users{' '}
            {assignable.users.length > 0
              ? `(${assignable.users.length} from Jira)`
              : 'using seed list'}
          </li>
        </ul>
      )}
      {state.ts && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Last checked {new Date(state.ts).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ─── Maintenance mode toggle (admin only) ─────────────────────────────────────
function MaintenanceToggleCard() {
  const [m, setM] = useState(getMaintenanceMode());
  const [draft, setDraft] = useState(m.message || 'Scheduled maintenance in progress.');
  useEffect(() => subscribeMaintenance(setM), []);

  const toggle = () => {
    if (m.active) {
      setMaintenanceMode(false, '', _currentActor);
    } else {
      setMaintenanceMode(true, draft, _currentActor);
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        padding: '16px 18px',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Maintenance mode
        </div>
        <span
          style={{
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '4px',
            background: m.active ? 'rgba(220, 38, 38, 0.18)' : 'rgba(22, 163, 74, 0.18)',
            color: m.active ? '#B91C1C' : '#15803D',
            fontWeight: 700,
          }}
        >
          {m.active ? 'ON' : 'OFF'}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={m.active}
        aria-label="Maintenance message"
        rows={2}
        placeholder="Banner message users will see…"
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1.5px solid var(--border-default)',
          borderRadius: '7px',
          fontSize: '12px',
          fontFamily: "'Inter', sans-serif",
          resize: 'vertical',
          outline: 'none',
          background: m.active ? 'var(--bg-hover)' : 'var(--bg-input)',
          color: m.active ? 'var(--text-muted)' : 'var(--text-primary)',
        }}
      />
      <button
        onClick={toggle}
        style={{
          marginTop: '10px',
          width: '100%',
          padding: '9px',
          background: m.active ? '#DC2626' : 'var(--bg-branded)',
          color: '#fff',
          border: 'none',
          borderRadius: '7px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {m.active ? 'Disable maintenance mode' : 'Enable maintenance mode'}
      </button>
      {m.active && m.enabledBy && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Enabled by {m.enabledBy} at {new Date(m.enabledAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ─── Global search palette (Cmd/Ctrl+K) ───────────────────────────────────────
function GlobalSearchPalette({ open, onClose, onNavigate, role }) {
  const can = useCan();
  const [q, setQ] = useState('');
  const [, _setVer] = useState(0);
  useEffect(() => subscribeTickets(_setVer), []);
  useEffect(() => subscribeUsers(_setVer), []);

  useEffect(() => {
    if (open) setQ('');
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return { docs: [], tickets: [], users: [] };
    const isAdmin = can('users.edit');

    const docs = listDocSummaries()
      .filter(
        d =>
          d.title.toLowerCase().includes(query) ||
          d.description.toLowerCase().includes(query) ||
          d.category.toLowerCase().includes(query)
      )
      .slice(0, 5);

    const tickets = MOCK_TICKETS.filter(
      t =>
        t.id.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query)
    ).slice(0, 5);

    const users = isAdmin
      ? listUsers()
          .filter(
            u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
          )
          .slice(0, 5)
      : [];

    return { docs, tickets, users };
  }, [q, role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const totalCount = results.docs.length + results.tickets.length + results.users.length;

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,54,0.55)', zIndex: 700 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search portal"
        style={{
          position: 'fixed',
          top: '12vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          maxWidth: '94vw',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          boxShadow: '0 24px 72px rgba(0,0,0,0.28)',
          zIndex: 701,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '70vh',
          overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '18px' }}>🔍</span>
          <input
            autoFocus
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search docs, tickets, users…"
            aria-label="Global search"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              fontFamily: "'Inter', sans-serif",
              color: 'var(--text-primary)',
              background: 'transparent',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              padding: '2px 6px',
              background: 'var(--bg-hover)',
              borderRadius: '4px',
              fontWeight: 700,
            }}
          >
            ESC
          </span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {q.trim() === '' ? (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              Start typing to search across the portal. <br />
              Tip: use <strong>⌘K</strong> / <strong>Ctrl+K</strong> from anywhere.
            </div>
          ) : totalCount === 0 ? (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              No matches for "{q}".
            </div>
          ) : (
            <>
              {results.docs.length > 0 && (
                <ResultsGroup
                  label="Documents"
                  icon="📚"
                  items={results.docs.map(d => ({
                    key: d.title,
                    title: d.title,
                    sub: `${d.category} · ${d.description.slice(0, 80)}`,
                  }))}
                  onPick={() => {
                    onNavigate('docs');
                    onClose();
                  }}
                />
              )}
              {results.tickets.length > 0 && (
                <ResultsGroup
                  label="Tickets"
                  icon="🎟️"
                  items={results.tickets.map(t => ({
                    key: t.id,
                    title: t.title,
                    sub: `${t.id} · ${t.priority} · ${t.status}`,
                  }))}
                  onPick={() => {
                    onNavigate('mytickets');
                    onClose();
                  }}
                />
              )}
              {results.users.length > 0 && (
                <ResultsGroup
                  label="Users"
                  icon="👥"
                  items={results.users.map(u => ({
                    key: u.id,
                    title: u.name,
                    sub: `${u.email} · ${u.role}`,
                  }))}
                  onPick={() => {
                    onNavigate('users');
                    onClose();
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ResultsGroup({ label, icon, items, onPick }) {
  return (
    <div style={{ padding: '6px 8px' }}>
      <div
        style={{
          padding: '8px 10px',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {icon} {label}
      </div>
      {items.map(it => (
        <button
          key={it.key}
          onClick={onPick}
          style={{
            width: '100%',
            textAlign: 'left',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '8px 12px',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            fontFamily: "'Inter', sans-serif",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-page)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {it.title}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{it.sub}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Feedback widget (all authenticated users) ────────────────────────────────
// The floating bubble on every page. A quick composer for the Suggestions
// board: title + category + details, plus a read-only "Page" field captured
// from the section the user was on when they opened it. Submissions land on
// the shared Suggestions board (and ring superadmins' bells).
function FeedbackWidget({ effectiveUser: _effectiveUser, section, activeBoardKey, onOpenBoard }) {
  const { currentRole } = useRbacCtx();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Feature');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // Captured at open time so navigating while typing doesn't move it.
  const [capturedPage, setCapturedPage] = useState({ page: 'home', label: 'Home' });

  const openPanel = () => {
    const label =
      (SECTION_LABELS[section] || section) +
      (section === 'board' && activeBoardKey ? ` · ${activeBoardKey}` : '');
    setCapturedPage({ page: section, label });
    setSent(false);
    setError('');
    setOpen(true);
  };

  const submit = async () => {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError('');
    const { error: apiError } = await submitSuggestion({
      title: title.trim(),
      body: body.trim(),
      category,
      page: capturedPage.page,
      pageLabel: capturedPage.label.slice(0, 80),
      authorName: _effectiveUser?.name,
      authorEmail: _effectiveUser?.email,
      authorRoleLabel: currentRole?.label || 'User',
      authorRoleColor: currentRole?.color || '#52525B',
    });
    if (apiError) {
      setError(apiError);
      setBusy(false);
      return;
    }
    setBusy(false);
    setSent(true);
    setTitle('');
    setBody('');
    setCategory('Feature');
  };

  const fieldLabel = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '5px',
  };
  const fieldInput = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1.5px solid var(--border-default)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <>
      {!open && (
        <button
          onClick={openPanel}
          aria-label="Send feedback"
          title="Send feedback"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 950,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            border: 'none',
            boxShadow: '0 8px 24px rgba(124,58,237,0.4)',
            cursor: 'pointer',
            fontSize: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          💡
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Send feedback"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 950,
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--bg-surface)',
            borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'var(--bg-branded)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
              }}
            >
              💡
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '14px' }}>Share feedback</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
                Posts to the Suggestions board
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {sent ? (
            <div style={{ padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}
              >
                Thanks — your suggestion was posted
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                It's live on the Suggestions board where the team and other users can weigh in.
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={() => setSent(false)}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--bg-elevated)',
                    border: '1.5px solid var(--border-default)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Send another
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpenBoard?.();
                  }}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--bg-elevated)',
                    border: '1.5px solid var(--border-default)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  View board
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={fieldLabel}>Header</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Summarise your feedback"
                  aria-label="Feedback header"
                  style={fieldInput}
                />
              </div>
              <div>
                <label style={fieldLabel}>Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  aria-label="Suggestion category"
                  style={fieldInput}
                >
                  {SUGGESTION_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Comment</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="What's working, what's not, what would help?"
                  aria-label="Feedback comment"
                  style={{ ...fieldInput, resize: 'vertical', minHeight: '96px' }}
                />
              </div>
              <div>
                <label style={fieldLabel}>Page</label>
                {/* Read-only by design: captured from where the user opened
                    the widget — context the reviewer can trust. */}
                <div
                  aria-label="Page where this feedback was created"
                  style={{
                    ...fieldInput,
                    background: 'var(--bg-input-disabled)',
                    color: 'var(--text-secondary)',
                    cursor: 'default',
                    userSelect: 'none',
                  }}
                >
                  📍 {capturedPage.label}
                </div>
              </div>
              {error && (
                <div role="alert" style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600 }}>
                  {error}
                </div>
              )}
              <button
                onClick={submit}
                disabled={!title.trim() || !body.trim() || busy}
                style={{
                  padding: '10px',
                  background:
                    !title.trim() || !body.trim() || busy
                      ? 'var(--bg-input-disabled)'
                      : 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  color: !title.trim() || !body.trim() || busy ? 'var(--text-muted)' : '#fff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: !title.trim() || !body.trim() || busy ? 'not-allowed' : 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Maintenance banner — fixed top of app when active ────────────────────────
function MaintenanceBanner() {
  const [m, setM] = useState(getMaintenanceMode());
  useEffect(() => subscribeMaintenance(setM), []);
  if (!m.active) return null;
  return (
    <div
      role="status"
      style={{
        background: 'rgba(245, 158, 11, 0.18)',
        borderBottom: '2px solid #FDE68A',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <span style={{ fontSize: '16px' }}>🛠</span>
      <div style={{ flex: 1, fontSize: '13px', color: '#92400E', fontWeight: 700 }}>
        {m.message}
        {m.enabledBy && (
          <span style={{ marginLeft: '8px', fontWeight: 400 }}>— posted by {m.enabledBy}</span>
        )}
      </div>
    </div>
  );
}

// ─── Audit log page (admin only) ──────────────────────────────────────────────
function AuditLogPage() {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeAudit(setVersion), []);
  const [actionFilter, setActionFilter] = usePersistentState('audit-action', 'all');
  const [actorFilter, setActorFilter] = usePersistentState('audit-actor', 'all');
  const [query, setQuery] = usePersistentState('audit-query', '');

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listAudit().filter(e => {
      if (actionFilter !== 'all' && !e.action.startsWith(actionFilter)) return false;
      if (actorFilter !== 'all' && e.actorEmail !== actorFilter) return false;
      if (q) {
        const hay = `${e.action} ${e.actorName} ${e.targetLabel || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [actionFilter, actorFilter, query, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueActors = useMemo(() => {
    const m = new Map();
    listAudit().forEach(e => m.set(e.actorEmail, e.actorName));
    return Array.from(m.entries());
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtTs = iso => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  };

  const actionLabel = a => AUDIT_ACTION_LABELS[a] || a;

  const labelForRoleId = roleId => findRole(roleId)?.label || roleId || '—';

  const renderDetails = e => {
    if (!e.details) return null;
    if (e.action === 'admin.view_as') {
      return e.details.mode === 'user' ? (
        <span>
          switched to <strong>regular-user view</strong>
        </span>
      ) : (
        <span>
          impersonating <strong>{e.details.targetName}</strong>
        </span>
      );
    }
    if (e.action === 'user.promote' || e.action === 'user.demote') {
      return (
        <span>
          {e.details.from} → <strong>{e.details.to}</strong>
        </span>
      );
    }
    if (e.action === 'user.role_change') {
      return (
        <span>
          {labelForRoleId(e.details.from)} → <strong>{labelForRoleId(e.details.to)}</strong>
        </span>
      );
    }
    if (e.action === 'user.update' && Array.isArray(e.details.changedKeys)) {
      return <span>changed {e.details.changedKeys.join(', ')}</span>;
    }
    if (e.action === 'user.create' && (e.details.roleId || e.details.role)) {
      const roleLabel = e.details.roleId ? labelForRoleId(e.details.roleId) : e.details.role;
      return (
        <span>
          as <strong>{roleLabel}</strong> in {e.details.department}
        </span>
      );
    }
    if (e.action === 'role.create' || e.action === 'role.delete') {
      const caps = e.details.capabilities;
      return Array.isArray(caps) && caps.length ? (
        <span>
          {caps.length} capabilit{caps.length === 1 ? 'y' : 'ies'}
        </span>
      ) : null;
    }
    if (e.action === 'capability.toggle') {
      const added = e.details.added?.length || 0;
      const removed = e.details.removed?.length || 0;
      return (
        <span>
          +{added} / -{removed}
        </span>
      );
    }
    if (e.action === 'role.update' && Array.isArray(e.details.changedKeys)) {
      return <span>changed {e.details.changedKeys.join(', ')}</span>;
    }
    if (e.action === 'system.settings_update') {
      const keys = Object.keys(e.details);
      return <span>updated {keys.join(', ')}</span>;
    }
    if (e.action === 'ticket.status_change') {
      return (
        <span>
          {e.details.from} → <strong>{e.details.to}</strong>
        </span>
      );
    }
    return null;
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
          Audit log
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Append-only record of admin actions. Entries are immutable (charter R-10).
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search action / actor / target…"
          aria-label="Search audit log"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: '200px',
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            outline: 'none',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
        <select
          aria-label="Filter by category"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All categories</option>
          <option value="user">User actions</option>
          <option value="admin">Admin/view-as</option>
          <option value="session">Sessions</option>
        </select>
        <select
          aria-label="Filter by actor"
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All actors</option>
          {uniqueActors.map(([email, name]) => (
            <option key={email} value={email}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No audit entries yet. Mutations from the Users panel will appear here.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {entries.map(e => (
              <li
                key={e.id}
                style={{
                  padding: '12px 18px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    minWidth: '150px',
                    fontFamily: 'monospace',
                  }}
                >
                  {fmtTs(e.timestamp)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>
                    {actionLabel(e.action)}
                  </div>
                  <div
                    style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}
                  >
                    <strong>{e.actorName}</strong>
                    {e.targetLabel && (
                      <>
                        {' '}
                        · target: <strong>{e.targetLabel}</strong>
                      </>
                    )}
                    {renderDetails(e) && <> · {renderDetails(e)}</>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Resources dropdown (groups reference pages) ─────────────────────────────
// Human-readable names for portal sections — shown in the feedback widget's
// read-only "Page" field and carried into the admin Feedback inbox.
const SECTION_LABELS = {
  home: 'Home',
  submit: 'Submit Ticket',
  mytickets: 'My Tickets',
  approvals: 'Approvals',
  board: 'Board',
  devportal: 'Developer Portal',
  docs: 'Documentation',
  suggestions: 'Suggestions',
  priority: 'Priority Guide',
  sla: 'SLA & Standards',
  incidents: 'Incidents',
  problems: 'Problems',
  changes: 'Changes',
  assets: 'Assets',
  studio: 'Doc Studio',
  admin: 'Admin Console',
  'catalog-admin': 'Service Catalog',
  'spaces-admin': 'Spaces & Boards',
  reports: 'Reports',
  roles: 'Roles & Access',
  users: 'Users',
  audit: 'Audit log',
};

const RESOURCE_ITEMS = [
  { id: 'docs', Icon: BookOpen, label: 'Documentation', hint: 'IT guides and how-tos' },
  {
    id: 'suggestions',
    Icon: Sparkles,
    label: 'Suggestions',
    hint: 'Request features, docs & changes',
  },
  { id: 'priority', Icon: Target, label: 'Priority Guide', hint: 'P0–P3 definitions' },
  {
    id: 'sla',
    Icon: ClipboardList,
    label: 'SLA & Standards',
    hint: 'Response and resolution targets',
  },
];

// ─── Operations dropdown items (ITSM modules, staff-facing) ──────────────────
// Grouped behind one nav button like Resources — the direct tabs stay for the
// personal destinations (Home / Submit / My Tickets / Approvals / Board).
// Each entry is capability-gated; the dropdown hides items (and itself) the
// effective user can't open. Backend mode only — these modules are DB-backed.
const OPS_ITEMS = [
  {
    id: 'incidents',
    Icon: Siren,
    label: 'Incidents',
    hint: 'Severity, comms & postmortems',
    cap: 'tickets.view_all',
  },
  {
    id: 'problems',
    Icon: SearchCheck,
    label: 'Problems',
    hint: 'Root causes & known errors',
    cap: 'tickets.view_all',
  },
  {
    id: 'changes',
    Icon: GitBranch,
    label: 'Changes',
    hint: 'Change requests & calendar',
    cap: 'tickets.view_all',
  },
  {
    id: 'assets',
    Icon: Package,
    label: 'Assets',
    hint: 'Hardware, software & licenses',
    cap: 'assets.view',
  },
];

// ─── Shared style for Radix DropdownMenu surfaces ────────────────────────────
const radixMenuContentStyle = {
  minWidth: '240px',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-dropdown)',
  padding: '6px',
  border: '1px solid var(--border-default)',
  zIndex: 1000,
  fontFamily: "'Inter', sans-serif",
};
const radixMenuItemStyle = isActive => ({
  width: '100%',
  textAlign: 'left',
  background: isActive ? 'var(--accent-soft)' : 'transparent',
  color: 'var(--text-primary)',
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '13px',
  outline: 'none',
  userSelect: 'none',
});
// ─── Theme toggle button (light / dark) ──────────────────────────────────────
// Lives in the nav between the notification bell and the avatar. Visible to
// every authenticated user — theme is a personal preference, not gated by role.
function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={toggleTheme}
          aria-label={label}
          className="pomelo-icon-btn"
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            lineHeight: 1,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '32px',
          }}
        >
          {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} style={tooltipContentStyle}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const tooltipContentStyle = {
  background: 'var(--text-primary)',
  color: 'var(--bg-surface)',
  padding: '5px 9px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '11.5px',
  fontFamily: "'Inter', sans-serif",
  fontWeight: 500,
  letterSpacing: '0.005em',
  zIndex: 1100,
  boxShadow: 'var(--shadow-card)',
};

// ─── Board section host ───────────────────────────────────────────────────────
// Owns store wiring for the presentational BoardPage (src/components/pages):
// ticket subscription, drag permissions, quick create, and the full
// TicketDetail view when a card is opened. All mutations use the same
// updateTickets + mirror + pushJiraTransition path as every other page.
function BoardSectionHost({ currentUser, setSection, activeBoard }) {
  const can = useCan();
  const [, _setTicketsVersion] = useState(0);
  useEffect(() => subscribeTickets(_setTicketsVersion), []);

  // Board switch: pull that board's tickets from the server (boot hydration is
  // a global 200-row snapshot, which multi-board portfolios outgrow) and merge
  // into the store by uuid so other pages keep their rows.
  useEffect(() => {
    if (!API_ENABLED || !activeBoard?.id) return;
    ticketsApi.listTickets({ boardId: activeBoard.id, limit: 200 }).then(res => {
      if (!res.data?.tickets) return;
      const incoming = res.data.tickets.map(ticketFromApi);
      updateTickets(ts => {
        const byId = new Map(ts.map(t => [t.uuid || t.id, t]));
        for (const t of incoming) byId.set(t.uuid || t.id, t);
        return Array.from(byId.values());
      });
    });
  }, [activeBoard?.id]);
  const { addNotification } = useNotifications();
  const [openId, setOpenId] = useState(null);
  // Card click shows the quick-preview popup first (like Jira); clicking the
  // ticket ID inside it promotes to the full TicketDetail view.
  const [previewId, setPreviewId] = useState(null);

  const moveTicket = (id, newStatus) => {
    const ticket = MOCK_TICKETS.find(t => t.id === id);
    if (!ticket || ticket.status === newStatus) return;
    const prev = ticket.status;
    updateTickets(ts =>
      ts.map(t =>
        t.id === id
          ? { ...t, status: newStatus, updated: new Date().toISOString().slice(0, 10) }
          : t
      )
    );
    mirror(ticket.uuid && ticketsApi.updateTicket(ticket.uuid, { status: newStatus }));
    if (ticket.jiraKey) pushJiraTransition(ticket, newStatus).catch(() => {});
    recordAudit(
      'ticket.status_change',
      _currentActor,
      { type: 'ticket', id, label: ticket.title },
      { from: prev, to: newStatus }
    );
    addNotification({
      type: 'status_change',
      title: `Status updated: ${id}`,
      body: `${prev} → ${newStatus}`,
      ticketId: id,
    });
  };

  const assignTicket = (id, assignee) => {
    const ticket = MOCK_TICKETS.find(t => t.id === id);
    const assigneeEmail = assignee ? emailForAssignee(assignee) : null;
    updateTickets(ts =>
      ts.map(t => (t.id === id ? { ...t, assignee: assignee || null, assigneeEmail } : t))
    );
    mirror(
      ticket?.uuid && ticketsApi.assignTicket(ticket.uuid, assigneeEmail, assignee || undefined)
    );
  };

  // Board members (space or account-level grant, non-viewer) can work cards on
  // their own board even without global status capabilities — the server
  // enforces the same rule in the PATCH status gate.
  const isBoardWorker = activeBoard
    ? activeBoard.myRole === 'admin' || activeBoard.myRole === 'member'
    : false;

  const canDrag = t =>
    can('tickets.status_change_any') ||
    (can('tickets.status_change_own') &&
      !!currentUser?.email &&
      t.assigneeEmail === currentUser.email) ||
    isBoardWorker;

  const quickCreate = payload => {
    const today = new Date().toISOString().slice(0, 10);
    // Optimistic placeholder id; swapped for the server-minted KEY-n on ack.
    const id = activeBoard
      ? `${activeBoard.key}-tmp${String(Math.floor(Math.random() * 9000) + 1000)}`
      : `TKT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const ticket = {
      id,
      title: payload.title,
      category: 'General',
      priority: payload.priority,
      status: 'To Do',
      created: today,
      updated: today,
      description: '',
      assignee: payload.assignee,
      assigneeEmail: payload.assignee ? emailForAssignee(payload.assignee) : null,
      requester: { name: currentUser?.name || 'Unknown', email: currentUser?.email || null },
      department: currentUser?.department || null,
      shop: null,
      platforms: [],
      labels: payload.labels || [],
      dueDate: payload.dueDate,
      issueType: payload.issueType || 'Task',
      watchers: [],
      timeline: [
        {
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          action: 'Ticket created',
          actor: currentUser?.name || 'You',
        },
      ],
      messages: [],
      pullRequests: [],
      jiraSyncState: 'local-only',
      boardId: activeBoard?.id || null,
    };
    addTicket(ticket);
    if (API_ENABLED) {
      ticketsApi
        .createTicket({
          title: ticket.title,
          description: '',
          priority: ticket.priority,
          platforms: [],
          labels: ticket.labels,
          issueType: ticket.issueType,
          ...(activeBoard ? { boardId: activeBoard.id } : {}),
          ...(ticket.dueDate ? { dueDate: ticket.dueDate } : {}),
          ...(ticket.assigneeEmail
            ? { assigneeEmail: ticket.assigneeEmail, assigneeName: ticket.assignee }
            : {}),
        })
        .then(res => {
          if (res.error) return console.warn('[api] backend mirror failed:', res.error);
          const localId = ticket.id;
          updateTickets(ts =>
            ts.map(x =>
              x.id === localId
                ? { ...x, id: res.data.key, key: res.data.key, uuid: res.data.id }
                : x
            )
          );
        });
    }
    recordAudit('ticket.create', _currentActor, { type: 'ticket', id, label: ticket.title });
    addNotification({
      type: 'ticket_message',
      title: `Ticket created: ${id}`,
      body: ticket.title,
      ticketId: id,
    });
  };

  const selected = openId ? MOCK_TICKETS.find(t => t.id === openId) : null;
  if (selected) {
    return (
      <TicketDetail
        ticket={selected}
        onBack={() => setOpenId(null)}
        currentUser={currentUser}
        onStatusChange={moveTicket}
        onAssigneeChange={assignTicket}
        onAddNotification={addNotification}
        onOpenTicket={setOpenId}
      />
    );
  }

  const preview = previewId ? MOCK_TICKETS.find(t => t.id === previewId) : null;

  return (
    <>
      <BoardPage
        key={activeBoard?.key || 'default'}
        tickets={
          activeBoard
            ? MOCK_TICKETS.filter(t => t.boardId === activeBoard.id)
            : MOCK_TICKETS.slice()
        }
        boardKey={activeBoard?.key || null}
        currentUser={currentUser}
        canDrag={canDrag}
        canCreate={can('tickets.view_all') || isBoardWorker}
        assignableUsers={listAssignableUsers().map(u => u.name)}
        onMoveTicket={moveTicket}
        onOpenTicket={t => setPreviewId(t.id)}
        onQuickCreate={quickCreate}
        onOpenFullForm={() => setSection('submit')}
      />
      {preview && (
        <TicketPopupModal
          ticket={preview}
          onClose={() => setPreviewId(null)}
          onOpenFull={id => {
            setPreviewId(null);
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}

function ResourcesDropdown({ section, onPick }) {
  const active = RESOURCE_ITEMS.find(r => r.id === section);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Resources"
          title={active ? `Resources · ${active.label}` : 'Resources'}
          style={{
            ...S.navTab(Boolean(active)),
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <BookOpen size={15} strokeWidth={2} />
          <span className="pomelo-btn-label">{active ? active.label : 'Resources'}</span>
          <ChevronDown size={13} strokeWidth={2.4} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="start" style={radixMenuContentStyle}>
          {RESOURCE_ITEMS.map(r => {
            const isActive = section === r.id;
            return (
              <DropdownMenu.Item
                key={r.id}
                onSelect={() => onPick(r.id)}
                style={radixMenuItemStyle(isActive)}
              >
                <span
                  style={{
                    width: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <r.Icon size={16} strokeWidth={2} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)' }}>
                    {r.label}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {r.hint}
                  </div>
                </span>
                {isActive && (
                  <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent-primary)' }} />
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function OperationsDropdown({ section, onPick }) {
  const can = useCan();
  const items = OPS_ITEMS.filter(o => can(o.cap));
  const active = items.find(o => o.id === section);
  if (!items.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Operations"
          title={active ? `Operations · ${active.label}` : 'Operations'}
          style={{
            ...S.navTab(Boolean(active)),
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Siren size={15} strokeWidth={2} />
          <span className="pomelo-btn-label">{active ? active.label : 'Operations'}</span>
          <ChevronDown size={13} strokeWidth={2.4} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="start" style={radixMenuContentStyle}>
          {items.map(o => {
            const isActive = section === o.id;
            return (
              <DropdownMenu.Item
                key={o.id}
                onSelect={() => onPick(o.id)}
                style={radixMenuItemStyle(isActive)}
              >
                <span
                  style={{
                    width: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <o.Icon size={16} strokeWidth={2} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)' }}>
                    {o.label}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {o.hint}
                  </div>
                </span>
                {isActive && (
                  <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent-primary)' }} />
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AdminToolsDropdown({ section, onPick }) {
  const can = useCan();
  const items = ADMIN_TOOLS.filter(t => can(t.cap));
  const active = items.find(t => t.id === section);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Admin tools"
          title={active ? `Admin · ${active.label}` : 'Admin tools'}
          className="pomelo-icon-btn"
          style={{
            padding: '6px 13px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            background: active ? 'var(--accent-primary)' : 'var(--accent-soft)',
            color: active ? 'var(--text-inverse)' : 'var(--accent-primary)',
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Wrench size={15} strokeWidth={2} />
          <span className="pomelo-btn-label">{active ? active.label : 'Admin'}</span>
          <ChevronDown size={13} strokeWidth={2.4} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="end" style={radixMenuContentStyle}>
          {items.map(t => {
            const isActive = section === t.id;
            return (
              <DropdownMenu.Item
                key={t.id}
                onSelect={() => onPick(isActive ? 'home' : t.id)}
                style={radixMenuItemStyle(isActive)}
              >
                <span
                  style={{
                    width: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <t.Icon size={16} strokeWidth={2} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)' }}>
                    {t.label}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {t.hint}
                  </div>
                </span>
                {isActive && (
                  <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent-primary)' }} />
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Admin tools dropdown ────────────────────────────────────────────────────
// Groups the four admin-only destinations behind a single nav button to
// reclaim space and keep related actions together.
// Sections that benefit from the wider main column (tables, kanban, matrices).
const WIDE_SECTIONS = new Set([
  'admin',
  'users',
  'audit',
  'roles',
  'devportal',
  'board',
  'catalog-admin',
  'assets',
  'incidents',
  'problems',
  'changes',
  'reports',
]);

// Sections that use the FULL remaining width (edge to edge, like a workspace).
// The board needs it for its 11 columns; the doc builder + library use it so
// the editor, preview, and admin tables can breathe on large displays.
const FULL_SECTIONS = new Set(['board', 'studio', 'docs']);

// Every navigable section id — used to validate URL hashes so a stale or
// mistyped hash can never render a broken page.
const VALID_SECTIONS = new Set([
  'home',
  'submit',
  'docs',
  'suggestions',
  'priority',
  'sla',
  'mytickets',
  'devportal',
  'studio',
  'admin',
  'roles',
  'users',
  'audit',
  'board',
  'catalog-admin',
  'spaces-admin',
  'approvals',
  'assets',
  'incidents',
  'problems',
  'changes',
  'reports',
]);
const sectionFromHash = () => {
  const h = window.location.hash.replace('#', '');
  const [head] = h.split('/');
  return VALID_SECTIONS.has(head) ? head : 'home';
};
// Board deep links carry the board key as a second segment: #board/PESD1.
// Any other section stays a flat id; unknown keys resolve later against the
// hydrated spaces store (never a broken page).
const boardKeyFromHash = () => {
  const h = window.location.hash.replace('#', '');
  const [head, key] = h.split('/');
  return head === 'board' && key ? decodeURIComponent(key) : null;
};

// Transactional-email deep links use PATHS (not hashes): /verify,
// /accept-invite and /reset all carry ?token=… . Captured once at boot; the
// shell consumes the token and then normalises the URL back to /#home so a
// refresh never replays it.
const AUTH_LINK_KINDS = new Set(['verify', 'accept-invite', 'reset']);
const authLinkFromLocation = () => {
  const kind = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const token = new URLSearchParams(window.location.search).get('token');
  return AUTH_LINK_KINDS.has(kind) && token ? { kind, token } : null;
};

const ADMIN_TOOLS = [
  {
    id: 'studio',
    Icon: BookOpen,
    label: 'Doc Studio',
    hint: 'Author & edit documentation',
    cap: 'docs.manage',
  },
  {
    id: 'admin',
    Icon: Wrench,
    label: 'Admin Console',
    hint: 'System health & controls',
    cap: 'admin.kanban_view',
  },
  {
    id: 'catalog-admin',
    Icon: LayoutGrid,
    label: 'Service Catalog',
    hint: 'Request types & forms',
    cap: 'catalog.manage',
  },
  {
    id: 'spaces-admin',
    Icon: ClipboardList,
    label: 'Spaces & Boards',
    hint: 'Team spaces, boards, membership',
    cap: 'spaces.manage',
  },
  {
    id: 'reports',
    Icon: BarChart3,
    label: 'Reports',
    hint: 'KPIs, SLA, CSAT trends',
    cap: 'reports.view',
  },
  {
    id: 'roles',
    Icon: Shield,
    label: 'Roles & Access',
    hint: 'Roles, capabilities, user creation',
    cap: 'roles.edit',
  },
  {
    id: 'users',
    Icon: UsersIcon,
    label: 'Users',
    hint: 'Manage portal accounts',
    cap: 'users.edit',
  },
  {
    id: 'audit',
    Icon: ScrollText,
    label: 'Audit log',
    hint: 'Immutable action history',
    cap: 'audit.view',
  },
];
// ─── Admin View Mode pill ─────────────────────────────────────────────────────
// Visible only to real superadmins. Lets them downgrade their view to "regular
// user" or impersonate a specific user without changing the underlying session.
function AdminViewModePill({ viewAs, onSet, allUsers, currentUserName }) {
  const LabelIcon = viewAs === null ? Star : viewAs === 'user' ? User : Eye;
  const labelTextOnly =
    viewAs === null
      ? 'Admin Mode'
      : viewAs === 'user'
        ? 'User View'
        : `Viewing as ${viewAs.name.split(' ')[0]}`;
  const labelColor = viewAs === null ? 'var(--accent-primary)' : '#D97706';
  const borderColor = viewAs === null ? 'var(--accent-primary)' : '#F59E0B';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Switch admin view mode"
          title={labelTextOnly}
          className="pomelo-icon-btn"
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1.5px solid ${borderColor}`,
            background: 'var(--bg-elevated)',
            color: labelColor,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <LabelIcon size={14} strokeWidth={2} />
          <span className="pomelo-btn-label">{labelTextOnly}</span>
          <ChevronDown size={13} strokeWidth={2.4} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="end" style={radixMenuContentStyle}>
          <DropdownMenu.Label
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            View Mode
          </DropdownMenu.Label>
          <DropdownMenu.Item
            onSelect={() => onSet(null)}
            style={radixMenuItemStyle(viewAs === null)}
          >
            <Star
              size={14}
              strokeWidth={2}
              style={{ color: viewAs === null ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            />
            <span style={{ flex: 1, fontWeight: viewAs === null ? 600 : 500 }}>
              Admin (default)
            </span>
            {viewAs === null && (
              <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent-primary)' }} />
            )}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => onSet('user')}
            style={radixMenuItemStyle(viewAs === 'user')}
          >
            <User
              size={14}
              strokeWidth={2}
              style={{
                color: viewAs === 'user' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}
            />
            <span style={{ flex: 1, fontWeight: viewAs === 'user' ? 600 : 500 }}>
              View as regular user
            </span>
            {viewAs === 'user' && (
              <Check size={14} strokeWidth={2.4} style={{ color: 'var(--accent-primary)' }} />
            )}
          </DropdownMenu.Item>
          <DropdownMenu.Separator
            style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }}
          />
          <DropdownMenu.Label
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Impersonate user
          </DropdownMenu.Label>
          {allUsers
            .filter(u => u.name !== currentUserName)
            .map(u => {
              const active = viewAs && typeof viewAs === 'object' && viewAs.email === u.email;
              return (
                <DropdownMenu.Item
                  key={u.email}
                  onSelect={() =>
                    onSet({ name: u.name, email: u.email, department: u.department, role: u.role })
                  }
                  style={{ ...radixMenuItemStyle(active), justifyContent: 'space-between' }}
                >
                  <span style={{ fontWeight: active ? 600 : 500 }}>{u.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {u.role === 'superadmin' ? 'admin' : u.role}
                    {active ? ' ✓' : ''}
                  </span>
                </DropdownMenu.Item>
              );
            })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── RBAC context ─────────────────────────────────────────────────────────────
// One source of truth for "what can the effective user do right now?". Read
// via useCan() at every gating site. The provider lives inside AppContent so
// `can` flips automatically when impersonation, login, role edits, or
// capability toggles happen.
const RbacContext = createContext({
  can: () => false,
  roles: [],
  currentRole: null,
  settings: {
    defaultAssigneeName: DEFAULT_ASSIGNEE.name,
    defaultAssigneeEmail: DEFAULT_ASSIGNEE.email,
  },
});
function useCan() {
  return useContext(RbacContext).can;
}
function useRoles() {
  return useContext(RbacContext).roles;
}
function useRbacCtx() {
  return useContext(RbacContext);
}

// ─── Main App (inner) ─────────────────────────────────────────────────────────
// Theme design tokens (light + dark). Shared so BOTH the pre-auth login page
// and the authenticated app define the CSS variables — otherwise the login page
// renders before these are mounted and var(--accent-primary) etc. resolve to
// nothing (invisible Sign In button, unstyled links).
const THEME_TOKENS_CSS = `
  :root, [data-theme="light"] {
    --bg-page: #FAFAF9;
    --bg-surface: #FFFFFF;
    --bg-elevated: #FFFFFF;
    --bg-input: #FAFAF9;
    --bg-input-disabled: #F4F4F5;
    --bg-hover: #F4F4F5;
    --bg-overlay: rgba(15,15,18,0.45);
    --bg-nav: #FFFFFF;
    --border-default: #E4E4E7;
    --border-subtle: #F4F4F5;
    --border-strong: #D4D4D8;
    --text-primary: #0A0A0B;
    --text-secondary: #52525B;
    --text-muted: #A1A1AA;
    --text-inverse: #FFFFFF;
    --accent-primary: #6366F1;
    --accent-soft: #EEF2FF;
    --shadow-card: 0 1px 2px rgba(15,15,18,0.04), 0 2px 6px rgba(15,15,18,0.06);
    --shadow-dropdown: 0 1px 3px rgba(15,15,18,0.06), 0 8px 24px rgba(15,15,18,0.10), 0 16px 40px rgba(15,15,18,0.06);
    --shadow-modal: 0 4px 12px rgba(15,15,18,0.08), 0 32px 80px rgba(15,15,18,0.15);
    --focus-ring: 0 0 0 3px rgba(99,102,241,0.18);
    --bg-branded: #111111;
    --bg-branded-2: #000000;
    --text-on-branded: #FFFFFF;
  }
  [data-theme="dark"] {
    --bg-page: #0B0B0E;
    --bg-surface: #17171A;
    --bg-elevated: #1C1C20;
    --bg-input: #1C1C20;
    --bg-input-disabled: #1C1C20;
    --bg-hover: #232328;
    --bg-overlay: rgba(0,0,0,0.7);
    --bg-nav: #0F0F12;
    --border-default: #2A2A2F;
    --border-subtle: #1F1F23;
    --border-strong: #3F3F46;
    --text-primary: #FAFAFA;
    --text-secondary: #A1A1AA;
    --text-muted: #71717A;
    --text-inverse: #FFFFFF;
    --accent-primary: #818CF8;
    --accent-soft: rgba(129,140,248,0.12);
    --shadow-card: 0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
    --shadow-dropdown: 0 1px 3px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.6), 0 16px 48px rgba(0,0,0,0.3);
    --shadow-modal: 0 4px 12px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.7);
    --focus-ring: 0 0 0 3px rgba(129,140,248,0.30);
    --bg-branded: #232329;
    --bg-branded-2: #1A1A1F;
    --text-on-branded: #FFFFFF;
  }
  :root {
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-xl: 20px;
  }
`;

function AppContent() {
  const { seedNotifications, addNotification } = useNotifications();
  // The active section lives in the URL hash so the browser's Back/Forward
  // buttons walk in-app navigation instead of leaving the app.
  const [section, setSection] = useState(sectionFromHash);
  const [activeBoardKey, setActiveBoardKey] = useState(boardKeyFromHash);
  const historySyncedRef = useRef(false);
  // Re-render when the spaces store hydrates (board nav, sidebar tree, gating).
  const [spacesVersion, setSpacesVersion] = useState(0);
  useEffect(() => subscribeSpaces(setSpacesVersion), []);

  // Section → history: every in-app navigation becomes a history entry. The
  // first sync uses replaceState so a fresh load doesn't add a dead entry.
  useEffect(() => {
    const target =
      section === 'board' && activeBoardKey
        ? `#board/${encodeURIComponent(activeBoardKey)}`
        : '#' + section;
    if (window.location.hash === target) return;
    if (historySyncedRef.current) {
      window.history.pushState({ section }, '', target);
    } else {
      window.history.replaceState({ section }, '', target);
    }
  }, [section, activeBoardKey]);
  useEffect(() => {
    historySyncedRef.current = true;
  }, []);

  // History → section: Back/Forward restore whatever the hash says. The sync
  // effect above sees hash === target afterwards, so no push-loop.
  useEffect(() => {
    const onPop = () => {
      setSection(sectionFromHash());
      setActiveBoardKey(boardKeyFromHash());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Resolve the active board once spaces hydrate: keep a valid deep-linked
  // key, else the last-used board (localStorage), else the first visible one.
  // Re-runs whenever the store changes (e.g. a board is archived away).
  useEffect(() => {
    if (section !== 'board' || !spacesLoaded()) return;
    const boards = allBoards();
    if (activeBoardKey && boards.some(b => b.key === activeBoardKey)) {
      saveStore('activeBoardKey', activeBoardKey);
      return;
    }
    const remembered = loadStore('activeBoardKey', null);
    const next = boards.find(b => b.key === remembered) || boards[0] || null;
    setActiveBoardKey(next ? next.key : null);
  }, [section, activeBoardKey, spacesVersion]);

  const [toast, setToast] = useState(null);
  // Notification deep link: which ticket My Tickets should auto-open.
  const [pendingTicketKey, setPendingTicketKey] = useState(null);
  // Email deep link (path-based): /verify, /reset, /accept-invite ?token=…
  const [authLink, setAuthLink] = useState(authLinkFromLocation);

  // Email verification: consume the token immediately (no form needed). This
  // was the missing half of the signup flow — the CTA landed on the SPA and
  // the token was never submitted, so email_verified never flipped.
  useEffect(() => {
    if (authLink?.kind !== 'verify') return;
    authApi.verifyEmail(authLink.token).then(res => {
      setToast(
        res.error
          ? { message: `Email verification failed: ${res.error}`, type: 'error' }
          : { message: 'Email verified — you can sign in now.', type: 'success' }
      );
      window.history.replaceState({}, '', '/#home');
      setAuthLink(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [role, setRole] = useState('user');
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Tri-state session restore: 'checking' renders a splash (not the login
  // page) so a slow/failed /auth/me never masquerades as a logout.
  const [authStatus, setAuthStatus] = useState(API_ENABLED ? 'checking' : 'out');
  const [suggestions, setSuggestions] = useState([]);
  // Bumped whenever the roles registry or settings change so consumers
  // (and the `can` memo below) re-evaluate without prop drilling.
  const [rolesVersion, setRolesVersion] = useState(0);
  const [settingsVersion, setSettingsVersion] = useState(0);
  useEffect(() => subscribeRoles(setRolesVersion), []);
  useEffect(() => subscribeSettings(setSettingsVersion), []);
  // viewAs: null = see as self (real role); 'user' = downgrade self to user view;
  // {user object} = impersonate that specific user. Session-only — resets on refresh.
  const [viewAs, setViewAs] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global ⌘K / Ctrl+K → open palette
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const effectiveRole =
    viewAs === 'user' ? 'user' : viewAs && typeof viewAs === 'object' ? viewAs.role : role;
  // effectiveUser carries roleId so RBAC gating (useCan) flips correctly when
  // impersonating. The 'view as regular user' shortcut downgrades to the
  // default role rather than referencing a specific user.
  const effectiveUser = useMemo(() => {
    if (viewAs && typeof viewAs === 'object') return viewAs;
    if (viewAs === 'user')
      return currentUser ? { ...currentUser, roleId: getDefaultRoleId() } : null;
    return currentUser;
  }, [viewAs, currentUser]);
  const isImpersonating = viewAs !== null;

  // Build the `can` callback. Recomputes whenever the effective user changes
  // OR the roles registry version bumps (e.g. admin toggled a capability) OR
  // the settings change — the last is referenced via settingsVersion only so
  // strip consumers re-render too.
  const can = useCallback(
    capId => hasPermission(effectiveUser, capId, listRoles()),
    [effectiveUser, rolesVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const currentRoleObj = effectiveUser?.roleId ? findRole(effectiveUser.roleId) : null;
  const rbacValue = useMemo(
    () => ({ can, roles: listRoles(), currentRole: currentRoleObj, settings: getSettings() }),
    [can, rolesVersion, settingsVersion, currentRoleObj] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const restore = (u, roleName) => {
      const roleId = u.roleId || LEGACY_ROLE_TO_ROLE_ID[roleName] || getDefaultRoleId();
      setCurrentUser({
        name: u.name,
        email: u.email,
        department: u.department,
        avatarUrl: u.avatarUrl || null,
        roleId,
      });
      setRole(roleName);
      setIsAuthenticated(true);
      setAuditActor({ name: u.name, email: u.email });
      if (!API_ENABLED) seedNotifications(buildSeedNotifications(u.name));
    };
    // Live Jira project metadata — all fall back silently. Only loaded once a
    // session exists (an anonymous visitor shouldn't generate API traffic).
    const loadJiraMeta = () => {
      loadJiraWorkflow();
      loadAssignableUsers();
      loadIssueTypes();
      loadComponents();
    };
    if (API_ENABLED) {
      // The session is an httpOnly cookie — ask the server who we are.
      // A failed check (429/5xx/timeout/cold start) is NOT "logged out":
      // retry with backoff; only a true 401 short-circuits to the login page.
      const attempt = (tries = 0) => {
        authApi.me().then(({ data: u, error }) => {
          if (u) {
            restore(u, u.role?.name || 'user');
            setAuthStatus('in');
            hydrateFromBackend();
            loadJiraMeta();
          } else if (!error) {
            setAuthStatus('out'); // genuine 401 — signed out
          } else if (tries < 3) {
            setTimeout(() => attempt(tries + 1), [2000, 5000, 10000][tries]);
          } else {
            setAuthStatus('out');
            setToast({
              message: 'Could not reach the server to restore your session — please sign in.',
              type: 'error',
            });
          }
        });
      };
      attempt();
    } else {
      const session = getSession();
      // Back-fill roleId for sessions created before the RBAC migration
      // landed — derive from the legacy role string. Once the user logs in
      // again, the createSession write will carry roleId natively.
      if (session) {
        restore(session, session.role);
        loadJiraMeta();
      }
      setAuthStatus('out');
    }
  }, [seedNotifications]);

  // Background Jira poll — runs while authenticated. Reconciles linked tickets
  // every 60s; harmless when Jira is unreachable (BFF returns unavailable:true).
  useEffect(() => {
    if (!isAuthenticated) return;
    pollAllJiraProjects();
    const id = setInterval(() => pollAllJiraProjects(), 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Webhook event polling — every 5s. Cheap because BFF buffers in memory and
  // only returns events newer than `since`.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => pollWebhookEvents(), 15_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Server-persisted notifications (SLA, approvals, CSAT) — 30s poll while
  // authenticated in backend mode; merges into the in-memory bell feed.
  useServerNotificationSync(isAuthenticated);

  const handleLogin = user => {
    const roleId = user.roleId || LEGACY_ROLE_TO_ROLE_ID[user.role] || getDefaultRoleId();
    setCurrentUser({
      name: user.name,
      email: user.email,
      department: user.department,
      avatarUrl: user.avatarUrl || null,
      roleId,
    });
    setRole(user.role);
    setIsAuthenticated(true);
    setAuthStatus('in');
    setViewAs(null);
    hydrateFromBackend();
    setAuditActor({ name: user.name, email: user.email });
    if (hasPermission({ roleId }, 'audit.view', listRoles()))
      recordAudit('session.login', { name: user.name, email: user.email });
    if (!API_ENABLED) seedNotifications(buildSeedNotifications(user.name));
  };

  const handleLogout = () => {
    if (currentUser && hasPermission(currentUser, 'audit.view', listRoles())) {
      recordAudit('session.logout', { name: currentUser.name, email: currentUser.email });
    }
    if (API_ENABLED) authApi.logout(); // clears the httpOnly cookie server-side
    clearSession();
    setIsAuthenticated(false);
    setAuthStatus('out');
    setCurrentUser(null);
    setRole('user');
    setViewAs(null);
    setAuditActor(null);
    setSection('home');
  };

  // Record view-mode changes (impersonation is a sensitive admin action — R-10).
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (!hasPermission(currentUser, 'system.impersonate', listRoles())) return;
    if (viewAs === null) return; // skip the initial null on login
    const detail =
      viewAs === 'user'
        ? { mode: 'user' }
        : { mode: 'impersonate', targetEmail: viewAs.email, targetName: viewAs.name };
    recordAudit(
      'admin.view_as',
      { name: currentUser.name, email: currentUser.email },
      null,
      detail
    );
  }, [viewAs, isAuthenticated, currentUser]);

  const initials =
    effectiveUser?.name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase() ?? '?';

  // Most-used destinations stay as direct buttons; the three reference pages
  // are grouped under a Resources dropdown below.
  // Developer Portal only appears for users with tickets.view_assigned —
  // typically Developers, Admins, Superadmins.
  const NAV_ITEMS = useMemo(() => {
    const items = [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'submit', label: 'Submit Ticket', icon: PlusCircle },
      { id: 'mytickets', label: 'My Tickets', icon: Ticket },
    ];
    if (API_ENABLED) {
      items.push({ id: 'approvals', label: 'Approvals', icon: Check });
    }
    if (can('tickets.view_all') || allBoards().length > 0) {
      items.push({ id: 'board', label: 'Board', icon: ClipboardList });
    }
    if (can('tickets.view_assigned')) {
      items.push({ id: 'devportal', label: 'Developer Portal', icon: Briefcase });
    }
    // Assets / Incidents / Problems / Changes live in the Operations dropdown
    // (OPS_ITEMS) — grouped like Resources to keep the tab row scannable.
    return items;
  }, [can, spacesVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const RESOURCE_IDS = new Set(['docs', 'suggestions', 'priority', 'sla']);

  // Left rail groups (Board section only) — main destinations, Resources,
  // then the admin surfaces the effective user can actually open.
  const sidebarGroups = useMemo(() => {
    const groups = [
      { label: null, items: NAV_ITEMS.map(i => ({ id: i.id, label: i.label, Icon: i.icon })) },
      // One group per space: its boards, deep-linkable as #board/<KEY>.
      ...listSpacesLocal()
        .filter(s => (s.boards || []).length > 0)
        .map(s => ({
          label: s.name,
          items: s.boards.map(b => ({
            id: `board/${b.key}`,
            label: b.name === b.key ? b.name : `${b.key} · ${b.name}`,
            Icon: ClipboardList,
          })),
        })),
      {
        label: 'Operations',
        items: API_ENABLED
          ? OPS_ITEMS.filter(o => can(o.cap)).map(({ id, Icon, label }) => ({ id, label, Icon }))
          : [],
      },
      {
        label: 'Resources',
        items: RESOURCE_ITEMS.map(({ id, Icon, label }) => ({ id, label, Icon })),
      },
      {
        label: 'Admin',
        items: ADMIN_TOOLS.filter(t => can(t.cap)).map(({ id, Icon, label }) => ({
          id,
          label,
          Icon,
        })),
      },
    ];
    return groups.filter(g => g.items.length > 0);
  }, [NAV_ITEMS, can, spacesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-section capability requirements. A section without an entry is
  // public. When the effective view's `can` flips below the required
  // capability (impersonation, role demotion, capability toggle), bounce
  // back home — the viewed user wouldn't see it.
  const SECTION_CAPS = useMemo(
    () => ({
      admin: 'admin.kanban_view',
      // 'board' has no static entry: access = tickets.view_all OR membership
      // in at least one board; handled in the bounce effect below.
      users: 'users.edit',
      roles: 'roles.edit',
      audit: 'audit.view',
      devportal: 'tickets.view_assigned',
      'catalog-admin': 'catalog.manage',
      'spaces-admin': 'spaces.manage',
      assets: 'assets.view',
      incidents: 'tickets.view_all',
      problems: 'tickets.view_all',
      changes: 'tickets.view_all',
      reports: 'reports.view',
    }),
    []
  );
  useEffect(() => {
    const required = SECTION_CAPS[section];
    if (required && !can(required)) setSection('home');
    // Board access = global staff OR membership in ≥1 board. Bounce only after
    // the spaces store has hydrated so deep links survive the loading race.
    if (
      section === 'board' &&
      !can('tickets.view_all') &&
      spacesLoaded() &&
      allBoards().length === 0
    )
      setSection('home');
  }, [section, can, SECTION_CAPS, spacesVersion]);

  // Re-seed notifications when the view flips so the impersonated/downgraded
  // view shows that user's notification history rather than the real session's.
  useEffect(() => {
    if (!isAuthenticated || API_ENABLED) return;
    const viewName = viewAs && typeof viewAs === 'object' ? viewAs.name : currentUser?.name;
    if (viewName) seedNotifications(buildSeedNotifications(viewName));
  }, [viewAs, isAuthenticated, currentUser?.name, seedNotifications]);

  const renderPage = () => {
    let page;
    switch (section) {
      case 'home':
        page = (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'submit':
        // Backend mode gets the service catalog as the submit front door with
        // the generic form as its fallback tile; mock mode keeps the legacy
        // form only (request types live in Postgres).
        page = API_ENABLED ? (
          <ServiceCatalogPage
            currentUser={effectiveUser}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
            genericForm={
              <SubmitPage
                setSection={setSection}
                showToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
                currentUser={effectiveUser}
              />
            }
          />
        ) : (
          <SubmitPage
            setSection={setSection}
            showToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
            currentUser={effectiveUser}
          />
        );
        break;
      case 'docs':
        page = (
          <DocImportExportPage
            role={effectiveRole}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            currentUser={effectiveUser}
            onDocEdit={doc =>
              addNotification({
                type: 'doc_edit',
                title: `Document updated: ${doc.title}`,
                body: `${effectiveUser?.name || 'You'} made changes to ${doc.title}.`,
                actorName: effectiveUser?.name || 'You',
                docId: doc.id,
              })
            }
          />
        );
        break;
      case 'suggestions':
        page = (
          <SuggestionsPage
            currentUser={effectiveUser}
            can={can}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        );
        break;
      case 'priority':
        page = <PriorityGuidePage />;
        break;
      case 'sla':
        page = (
          <SLAPage
            canManage={can('sla.manage')}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        );
        break;
      case 'mytickets':
        page = (
          <MyTicketsPage
            role={effectiveRole}
            currentUser={effectiveUser}
            openTicketKey={pendingTicketKey}
            onOpenedTicket={() => setPendingTicketKey(null)}
          />
        );
        break;
      case 'board':
        page = (
          <BoardSectionHost
            currentUser={effectiveUser}
            setSection={setSection}
            activeBoard={activeBoardKey ? boardByKey(activeBoardKey) : null}
          />
        );
        break;
      case 'devportal':
        page = can('tickets.view_assigned') ? (
          <DeveloperPortalPage currentUser={effectiveUser} />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'studio':
        page = can('docs.manage') ? (
          <DocStudioPage
            role={effectiveRole}
            currentUser={effectiveUser}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'admin':
        page = can('admin.kanban_view') ? (
          <AdminPage setSection={setSection} />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'catalog-admin':
        page = can('catalog.manage') ? (
          <CatalogAdminPage
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'spaces-admin':
        page = can('spaces.manage') ? (
          <SpacesAdminPage
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
            onSpacesChanged={reloadSpaces}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'approvals':
        page = (
          <MyApprovalsPage
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        );
        break;
      case 'assets':
        page = can('assets.view') ? (
          <AssetsPage
            canManage={can('assets.manage')}
            canExport={can('system.export_data')}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'incidents':
        page = can('tickets.view_all') ? (
          <IncidentsPage
            canManage={can('incidents.manage')}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
            onOpenDoc={() => setSection('docs')}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'problems':
        page = can('tickets.view_all') ? (
          <ProblemsPage
            canManage={can('problems.manage')}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'changes':
        page = can('tickets.view_all') ? (
          <ChangesPage
            canManage={can('changes.manage')}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'reports':
        page = can('reports.view') ? (
          <ReportsPage
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'roles':
        page = can('roles.edit') ? (
          <RolesAccessPage currentUserEmail={currentUser?.email} />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'users':
        page = can('users.edit') ? (
          <UsersPanelPage currentUserEmail={currentUser?.email} />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      case 'audit':
        page = can('audit.view') ? (
          <AuditLogPage />
        ) : (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
        break;
      default:
        page = (
          <HomePage setSection={setSection} role={effectiveRole} currentUser={effectiveUser} />
        );
    }
    return <ErrorBoundary key={section}>{page}</ErrorBoundary>;
  };

  if (!isAuthenticated) {
    // Session restore in flight — show a splash, never a login-page flash
    // that users read as "I was logged out".
    if (API_ENABLED && authStatus === 'checking') {
      return (
        <>
          <style>{THEME_TOKENS_CSS}</style>
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-page)',
              color: 'var(--text-muted)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
            }}
          >
            Restoring your session…
          </div>
        </>
      );
    }
    return (
      <>
        <style>{THEME_TOKENS_CSS}</style>
        {authLink && authLink.kind !== 'verify' ? (
          <TokenActionPage
            link={authLink}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
            onDone={user => {
              window.history.replaceState({}, '', '/#home');
              setAuthLink(null);
              if (user) handleLogin({ ...user, role: user.role?.name || 'user' });
            }}
          />
        ) : (
          <LoginPage
            onLogin={handleLogin}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        )}
        {/* Token-authenticated CSAT works pre-login (email deep link). */}
        {API_ENABLED && (
          <CsatPrompt
            isAuthenticated={false}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        )}
        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      </>
    );
  }

  return (
    <RbacContext.Provider value={rbacValue}>
      <div style={S.app}>
        <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        * { box-sizing: border-box; }
        button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
        input:focus, textarea:focus, select:focus { box-shadow: var(--focus-ring); }
        /* Subtle press feedback on every interactive surface */
        button:active { transform: scale(0.98); }
        button { transition: transform 0.08s ease-out, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; }

        /* ── Radix dropdown / dialog open-close animations ─────────────── */
        @keyframes radixIn   { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes radixOut  { from { opacity: 1; transform: translateY(0) scale(1); }        to { opacity: 0; transform: translateY(-4px) scale(0.97); } }
        [data-radix-popper-content-wrapper] > * { transform-origin: var(--radix-popper-transform-origin); }
        [data-state="open"][data-radix-menu-content],
        [data-state="open"][data-radix-popover-content],
        [data-state="open"][data-radix-tooltip-content] { animation: radixIn 150ms cubic-bezier(0.16,1,0.3,1); }
        [data-state="closed"][data-radix-menu-content],
        [data-state="closed"][data-radix-popover-content] { animation: radixOut 100ms ease-in; }

        /* ── Theme tokens ─────────────────────────────────────────────────
           Light (default) — applied when [data-theme="light"] or unset.
           Dark — applied when [data-theme="dark"] is set on <html>.
           Status colours (red/green/yellow/blue) are semantic and stay
           hardcoded throughout the codebase — not themed.
        ───────────────────────────────────────────────────────────────── */
        ${THEME_TOKENS_CSS}
        body {
          background: var(--bg-page);
          color: var(--text-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-feature-settings: 'cv11', 'ss01', 'ss03';
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        /* Smooth theme transitions — short, color-only so we don't interfere
           with hover/scale animations elsewhere. */
        html[data-theme] body,
        html[data-theme] [data-themed],
        html[data-theme] .pomelo-themed,
        html[data-theme] input, html[data-theme] select, html[data-theme] textarea, html[data-theme] button {
          transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }
        /* ── Responsive tiers ─────────────────────────────────────────────
           XL  (>= 1440px) — everything visible, full labels
           LG  (1200-1439) — hide "⌘K" hint + nav button shorter labels
           MD  (900-1199)  — admin button labels hidden, icon-only; avatar shows initials only
           SM  (768-899)   — central nav tabs collapse; search becomes icon
           XS  (< 768)     — phone layout, stack grids
        ────────────────────────────────────────────────────────────────── */
        .pomelo-nav-right { flex-wrap: nowrap; gap: 8px; }
        @media (max-width: 1439px) {
          .pomelo-btn-shortcut { display: none !important; }
        }
        @media (max-width: 1199px) {
          /* Hide admin button labels — keep only icons. aria-label provides screen-reader text */
          .pomelo-btn-label { display: none !important; }
          /* Shrink avatar name to initials at mid widths */
          .pomelo-avatar-name { display: none !important; }
          /* Tighter button padding so icons sit closer */
          .pomelo-icon-btn { padding: 6px 10px !important; }
        }
        @media (max-width: 899px) {
          /* Hide search label too */
          .pomelo-search-label { display: none !important; }
          /* Narrow gap between nav-right items */
          .pomelo-nav-right { gap: 5px !important; }
        }
        @media (max-width: 768px) {
          /* Stack any two-column admin grids to a single column */
          .pomelo-stack-on-mobile { display: flex !important; flex-direction: column !important; }
          /* Allow nav right to wrap on phones */
          .pomelo-nav-right { flex-wrap: wrap !important; justify-content: flex-end; gap: 6px !important; }
          /* Sidebar is hidden on phones — the top bar handles navigation */
          .pomelo-sidebar { display: none !important; }
          /* Tighter main padding */
          .pomelo-main { padding: 16px 12px !important; }
          /* Audit log split-view stacks */
          .pomelo-audit-grid { grid-template-columns: 1fr !important; }
          /* Even tighter nav padding on phones */
          .pomelo-nav { padding: 0 14px !important; }
        }
        /* Board card interaction states (pseudo-states can't be inline) */
        .pomelo-board-card { transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease; }
        .pomelo-board-card:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.12); border-color: var(--accent-primary); }
        .pomelo-board-card:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .pomelo-board-card { transition: none; }
          .pomelo-board-card:hover { transform: none; }
        }
      `}</style>

        <MaintenanceBanner />
        <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
          <nav className="pomelo-nav" style={S.nav}>
            <div style={S.navLogo}>
              <div>
                <div style={S.navLogoText}>Pomelo</div>
                <div style={S.navLogoSub}>TechOps Portal</div>
              </div>
            </div>

            <div className="pomelo-nav-tabs" style={S.navTabs}>
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    style={{
                      ...S.navTab(section === item.id),
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Icon size={15} strokeWidth={2} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {API_ENABLED && <OperationsDropdown section={section} onPick={setSection} />}
              <ResourcesDropdown
                section={RESOURCE_IDS.has(section) ? section : null}
                onPick={setSection}
              />
            </div>

            <div
              className="pomelo-nav-right"
              style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              {/* Global search trigger */}
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search (Cmd+K)"
                    className="pomelo-icon-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <Search size={14} strokeWidth={2.2} />
                    <span className="pomelo-search-label">Search</span>
                    <span
                      className="pomelo-btn-shortcut"
                      style={{
                        marginLeft: '4px',
                        padding: '1px 5px',
                        background: 'var(--border-default)',
                        color: 'var(--text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '10px',
                      }}
                    >
                      ⌘K
                    </span>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} style={tooltipContentStyle}>
                    Search (⌘K / Ctrl+K)
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              {/* View-mode pill — visible to anyone who can impersonate. Stays
              visible even while impersonating so it's the escape hatch back. */}
              {hasPermission(currentUser, 'system.impersonate', listRoles()) && (
                <AdminViewModePill
                  viewAs={viewAs}
                  onSet={setViewAs}
                  allUsers={MOCK_USERS}
                  currentUserName={currentUser?.name}
                />
              )}

              {/* Admin tools — single dropdown grouping admin destinations */}
              {(can('admin.kanban_view') ||
                can('users.edit') ||
                can('roles.edit') ||
                can('audit.view')) && <AdminToolsDropdown section={section} onPick={setSection} />}

              {/* Notification bell */}
              <NotificationBell
                onNavigate={(target, ticketId) => {
                  setSection(target);
                  if (target === 'mytickets' && ticketId) setPendingTicketKey(ticketId);
                }}
              />

              {/* Theme toggle — light/dark switch, visible to all users */}
              <ThemeToggleButton />

              {/* Avatar — clickable to open profile */}
              <button
                onClick={() => setProfileOpen(true)}
                aria-label={`Open profile for ${effectiveUser?.name || 'user'}`}
                title={effectiveUser?.name}
                style={{
                  ...S.navUser,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {effectiveUser?.avatarUrl ? (
                  <img
                    src={effectiveUser.avatarUrl}
                    alt=""
                    style={{ ...S.avatar, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={S.avatar}>{initials}</div>
                )}
                <span
                  className="pomelo-avatar-name"
                  style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}
                >
                  {effectiveUser?.name}
                </span>
                {isImpersonating && (
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(245, 158, 11, 0.18)',
                      color: '#92400E',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    VIEWING
                  </span>
                )}
              </button>
            </div>
          </nav>
        </Tooltip.Provider>

        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
          {/* The nav rail is a Board-workspace affordance (like Jira's project
              sidebar) — every other section navigates via the top bar. */}
          {section === 'board' && (
            <Sidebar
              groups={sidebarGroups}
              active={activeBoardKey ? `board/${activeBoardKey}` : section}
              onNavigate={id => {
                if (id.startsWith('board/')) {
                  setActiveBoardKey(id.slice('board/'.length));
                  setSection('board');
                } else {
                  setSection(id);
                }
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <main
              className="pomelo-main"
              style={{
                ...S.main,
                // FULL_SECTIONS stretch edge to edge (board, doc studio, docs);
                // WIDE_SECTIONS get 1400px; everything else stays 1100px.
                maxWidth: FULL_SECTIONS.has(section)
                  ? 'none'
                  : WIDE_SECTIONS.has(section)
                    ? '1400px'
                    : '1100px',
                padding:
                  FULL_SECTIONS.has(section) || WIDE_SECTIONS.has(section)
                    ? '24px 20px'
                    : undefined,
              }}
            >
              {renderPage()}
            </main>

            <footer style={S.footer}>
              Pomelo TechOps &nbsp;|&nbsp; Support Hours: Mon–Fri, 9:30 AM – 6:30 PM &nbsp;|&nbsp;
              Emergency: Slack #techops-urgent
            </footer>
          </div>
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
        {API_ENABLED && (
          <CsatPrompt
            isAuthenticated={isAuthenticated}
            onToast={(msg, type) => setToast({ message: msg, type: type || 'success' })}
          />
        )}
        {profileOpen && (
          <ProfileModal
            currentUser={effectiveUser}
            setCurrentUser={setCurrentUser}
            role={effectiveRole}
            onClose={() => setProfileOpen(false)}
            onLogout={handleLogout}
          />
        )}
        <FeedbackWidget
          effectiveUser={effectiveUser}
          section={section}
          activeBoardKey={activeBoardKey}
          onOpenBoard={() => setSection('suggestions')}
        />
        <GlobalSearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={target => setSection(target)}
          role={effectiveRole}
        />
      </div>
    </RbacContext.Provider>
  );
}

// ─── Root export — wraps AppContent in NotificationProvider ──────────────────
export default function PomeloTechOpsPortal() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}
