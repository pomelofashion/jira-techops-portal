// server/lib/spacesAccess.js
// Board/space access predicates. loadUserWithRole (server/auth.js) attaches
// `spaceRoles` ({spaceId → role}), `boardRoles` ({boardId → effective role})
// and `boardIds` to req.user; these helpers translate them into decisions.
// Effective board role = board_members grant when present, else the space
// membership role. Roles: 'admin' | 'member' | 'viewer' (viewer = read-only).
// Global capabilities (tickets.view_all / spaces.manage) override membership.

const hasCap = (user, cap) =>
  Array.isArray(user?.role?.capabilities) && user.role.capabilities.includes(cap);

// Read access to a board's tickets.
export const canSeeBoard = (user, boardId) =>
  hasCap(user, 'tickets.view_all') || Boolean(user?.boardRoles?.[boardId]);

// Create tickets on a board (viewers cannot).
export const canSubmitToBoard = (user, boardId) =>
  hasCap(user, 'tickets.view_all') ||
  user?.boardRoles?.[boardId] === 'admin' ||
  user?.boardRoles?.[boardId] === 'member';

// Manage a space (edit it, its boards, its members).
export const isSpaceAdmin = (user, spaceId) =>
  hasCap(user, 'spaces.manage') || user?.spaceRoles?.[spaceId] === 'admin';

// Manage a single board's settings/members. `board` is a row with id + space_id.
export const isBoardAdmin = (user, board) =>
  hasCap(user, 'spaces.manage') ||
  user?.spaceRoles?.[board.space_id] === 'admin' ||
  user?.boardRoles?.[board.id] === 'admin';

export const memberBoardIds = user => (Array.isArray(user?.boardIds) ? user.boardIds : []);
