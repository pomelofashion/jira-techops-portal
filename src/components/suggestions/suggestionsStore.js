// src/components/suggestions/suggestionsStore.js
// Store for the Suggestions board (Reddit-style feedback) — also fed by the
// floating feedback bubble. In backend mode (API_ENABLED) it keeps a
// module-level in-memory array that hydrates from /api/suggestions and syncs
// every mutation to the server in the background, so mutators stay
// synchronous for optimistic UI. Mock mode keeps the original
// localStorage-per-browser behavior with demo seeds.

import { API_ENABLED } from '../../api/client.js';
import {
  listSuggestions,
  createSuggestionApi,
  voteSuggestionApi,
  setSuggestionStatusApi,
  deleteSuggestionApi,
  addSuggestionCommentApi,
  deleteSuggestionCommentApi,
} from '../../api/suggestionsApi.js';

const KEY = 'pomelo:v1:suggestions';

// Backend-mode cache — hydrated from the server on page mount.
let MEMORY = [];

// Change listeners — lets the board re-render when a different surface (the
// feedback bubble, a background re-sync) writes to the store. Same pattern
// as the tickets store's version pub/sub.
const listeners = new Set();
export const subscribeSuggestions = fn => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach(fn => fn());

// Fire-and-forget server sync — optimistic UI keeps the local copy; a failed
// sync surfaces on the next hydration rather than blocking the interaction.
// pendingSyncs lets hydration skip applying a server snapshot fetched while a
// mutation was still in flight (it would briefly revert the optimistic UI).
let pendingSyncs = 0;
const sync = promise => {
  pendingSyncs++;
  promise
    .then(({ error }) => {
      if (error) console.error('[suggestions] sync failed:', error);
    })
    .finally(() => {
      pendingSyncs--;
    });
};

// Fetch the board from the server, replacing the in-memory copy.
export async function hydrateSuggestions() {
  if (!API_ENABLED) return loadSuggestions();
  const { data, error } = await listSuggestions();
  if (!error && data?.suggestions && pendingSyncs === 0) {
    MEMORY = data.suggestions;
    notify();
  }
  return MEMORY.slice();
}
const safeLocal = typeof window !== 'undefined' && window.localStorage;

export const STATUSES = ['Open', 'Under review', 'Planned', 'In progress', 'Done', 'Declined'];
export const STATUS_META = {
  Open: { color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
  'Under review': { color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  Planned: { color: '#0891B2', bg: 'rgba(8,145,178,0.12)' },
  'In progress': { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  Done: { color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
  Declined: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
};
export const CATEGORIES = ['Feature', 'Documentation', 'Change request', 'Bug', 'Other'];

const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Seed content (only when the store is empty) ──────────────────────────────
const seed = () => {
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  return [
    {
      id: uid('sg'),
      title: 'Add a dark-mode toggle to the mobile view',
      body: 'On phones the portal is always light. A **dark mode** toggle that follows the system setting would be much easier on the eyes during on-call.',
      category: 'Feature',
      status: 'Planned',
      authorName: 'Kai Nguyen',
      authorEmail: 'kai.nguyen@pomelo.com',
      authorRoleLabel: 'User',
      authorRoleColor: '#52525B',
      authorIsStaff: false,
      createdAt: iso(now - 1000 * 60 * 60 * 26),
      updatedAt: iso(now - 1000 * 60 * 60 * 2),
      votes: {
        'kai.nguyen@pomelo.com': 1,
        'prim.srisawat@pomelo.com': 1,
        'alex.lee@pomelo.com': 1,
      },
      comments: [
        {
          id: uid('cm'),
          parentId: null,
          authorName: 'Alex Lee',
          authorEmail: 'alex.lee@pomelo.com',
          authorRoleLabel: 'Superadmin',
          authorRoleColor: '#DC2626',
          isStaff: true,
          body: "On our radar — targeting next sprint. Here's a quick mock of the toggle placement.",
          attachments: [],
          createdAt: iso(now - 1000 * 60 * 60 * 2),
        },
      ],
    },
    {
      id: uid('sg'),
      title: 'Document the VPN split-tunnel setup for contractors',
      body: 'Contractors keep opening tickets for the same VPN steps. A short how-to with screenshots would cut these in half.',
      category: 'Documentation',
      status: 'Open',
      authorName: 'Prim Srisawat',
      authorEmail: 'prim.srisawat@pomelo.com',
      authorRoleLabel: 'User',
      authorRoleColor: '#52525B',
      authorIsStaff: false,
      createdAt: iso(now - 1000 * 60 * 60 * 5),
      updatedAt: iso(now - 1000 * 60 * 60 * 5),
      votes: { 'prim.srisawat@pomelo.com': 1 },
      comments: [],
    },
  ];
};

export function loadSuggestions() {
  if (API_ENABLED) return MEMORY.slice();
  if (!safeLocal) return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seed();
      window.localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

function save(list) {
  if (API_ENABLED) {
    MEMORY = list;
    notify();
    return list;
  }
  if (safeLocal) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* quota (e.g. large image data URLs) — drop silently */
    }
  }
  notify();
  return list;
}

// All mutators read-modify-write and return the new array so the caller can
// setState(mutator(...)) optimistically.
export function createSuggestion(fields) {
  const list = loadSuggestions();
  const now = new Date().toISOString();
  const item = {
    id: uid('sg'),
    title: fields.title,
    body: fields.body || '',
    category: fields.category || 'Other',
    status: 'Open',
    authorName: fields.authorName,
    authorEmail: fields.authorEmail,
    authorRoleLabel: fields.authorRoleLabel || 'User',
    authorRoleColor: fields.authorRoleColor || '#52525B',
    authorIsStaff: Boolean(fields.authorIsStaff),
    createdAt: now,
    updatedAt: now,
    votes: { [fields.authorEmail]: 1 }, // author auto-upvotes their own post
    comments: [],
    page: fields.page || '',
    pageLabel: fields.pageLabel || '',
  };
  if (API_ENABLED) {
    sync(
      createSuggestionApi({
        id: item.id,
        title: item.title,
        body: item.body,
        category: item.category,
        page: item.page,
        pageLabel: item.pageLabel,
        authorRoleLabel: item.authorRoleLabel,
        authorRoleColor: item.authorRoleColor,
      })
    );
  }
  return save([item, ...list]);
}

// Awaitable variant for surfaces that need real success/error feedback (the
// feedback bubble). Inserts the server-confirmed row into the local cache.
export async function submitSuggestion(fields) {
  if (!API_ENABLED) {
    createSuggestion(fields);
    return { error: null };
  }
  const { data, error } = await createSuggestionApi({
    id: uid('sg'),
    title: fields.title,
    body: fields.body || '',
    category: fields.category || 'Other',
    page: fields.page || '',
    pageLabel: fields.pageLabel || '',
    authorRoleLabel: fields.authorRoleLabel || 'User',
    authorRoleColor: fields.authorRoleColor || '#52525B',
  });
  if (error) return { error };
  MEMORY = [data, ...MEMORY.filter(s => s.id !== data.id)];
  notify();
  return { error: null, data };
}

export function voteSuggestion(id, email, dir) {
  const list = loadSuggestions().map(s => {
    if (s.id !== id) return s;
    const votes = { ...(s.votes || {}) };
    if (votes[email] === dir)
      delete votes[email]; // toggle off
    else votes[email] = dir;
    return { ...s, votes };
  });
  if (API_ENABLED) sync(voteSuggestionApi(id, dir));
  return save(list);
}

export function setStatus(id, status) {
  const list = loadSuggestions().map(s =>
    s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s
  );
  if (API_ENABLED) sync(setSuggestionStatusApi(id, status));
  return save(list);
}

export function deleteSuggestion(id) {
  if (API_ENABLED) sync(deleteSuggestionApi(id));
  return save(loadSuggestions().filter(s => s.id !== id));
}

export function addComment(id, comment) {
  const list = loadSuggestions().map(s => {
    if (s.id !== id) return s;
    const c = {
      id: uid('cm'),
      parentId: comment.parentId || null,
      authorName: comment.authorName,
      authorEmail: comment.authorEmail,
      authorRoleLabel: comment.authorRoleLabel || 'User',
      authorRoleColor: comment.authorRoleColor || '#52525B',
      isStaff: Boolean(comment.isStaff),
      body: comment.body || '',
      attachments: comment.attachments || [],
      createdAt: new Date().toISOString(),
    };
    if (API_ENABLED) {
      sync(
        addSuggestionCommentApi(id, {
          id: c.id,
          parentId: c.parentId,
          body: c.body,
          attachments: c.attachments,
          authorRoleLabel: c.authorRoleLabel,
          authorRoleColor: c.authorRoleColor,
        })
      );
    }
    return { ...s, comments: [...(s.comments || []), c], updatedAt: new Date().toISOString() };
  });
  return save(list);
}

export function deleteComment(id, commentId) {
  const list = loadSuggestions().map(s => {
    if (s.id !== id) return s;
    // Drop the comment and any replies pointing at it.
    const comments = (s.comments || []).filter(c => c.id !== commentId && c.parentId !== commentId);
    return { ...s, comments };
  });
  if (API_ENABLED) sync(deleteSuggestionCommentApi(id, commentId));
  return save(list);
}

// ─── Derived helpers ──────────────────────────────────────────────────────────
export const scoreOf = s => Object.values(s.votes || {}).reduce((sum, v) => sum + (v || 0), 0);

// Reddit-ish "hot": score damped by age so fresh, well-voted posts rise.
export const hotRank = s => {
  const score = scoreOf(s);
  const ageHrs = (Date.now() - new Date(s.createdAt).getTime()) / 3.6e6;
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  return sign * Math.log10(Math.max(Math.abs(score), 1)) - ageHrs / 12;
};

// Turn a pasted video URL into an embeddable URL when we recognise the provider.
// Returns { embed } for iframe providers, { direct } for raw video files, or
// { link } when we can only link out.
export function resolveVideo(url) {
  const u = (url || '').trim();
  if (!u) return null;
  try {
    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (yt) return { kind: 'embed', src: `https://www.youtube.com/embed/${yt[1]}` };
    const loom = u.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
    if (loom) return { kind: 'embed', src: `https://www.loom.com/embed/${loom[1]}` };
    const vimeo = u.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return { kind: 'embed', src: `https://player.vimeo.com/video/${vimeo[1]}` };
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { kind: 'direct', src: u };
    return { kind: 'link', src: u };
  } catch {
    return { kind: 'link', src: u };
  }
}

export const IMAGE_MAX_BYTES = 1_500_000; // ~1.5MB cap for in-browser image data URLs
