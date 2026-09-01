// src/rbac.js
// RBAC primitives — pure data + pure functions.
//
// This module is intentionally framework-free and side-effect-free. The
// monolithic PomeloTechOpsPortal.jsx owns the runtime registry (roles in
// memory, localStorage hydration, audit emission, migration) and feeds the
// registry into `hasPermission()` at every gating site.
//
// Why split this out: the capability list and seed role definitions are
// long, structural, and don't change at runtime — keeping them out of the
// 6000-line monolith makes diffs reviewable and the registry easy to find.

// ─── Capabilities (static, compile-time) ──────────────────────────────────────
// Capabilities are NOT user-editable — only role membership is. Adding a new
// capability is a code change so that gating call-sites stay checking known
// strings. `group` is the heading the Roles & Access page uses for the matrix.
export const CAPABILITIES = Object.freeze([
  // Users
  {
    id: 'users.create',
    group: 'Users',
    label: 'Create users',
    description: 'Add a new user account from the Roles & Access page.',
  },
  {
    id: 'users.edit',
    group: 'Users',
    label: 'Edit users',
    description: 'Change name, email, or department on any user.',
  },
  {
    id: 'users.delete',
    group: 'Users',
    label: 'Delete users',
    description: 'Permanently remove a user account.',
  },
  {
    id: 'users.promote',
    group: 'Users',
    label: 'Promote users',
    description: 'Move a user into a more privileged role.',
  },
  {
    id: 'users.demote',
    group: 'Users',
    label: 'Demote users',
    description: 'Move a user into a less privileged role.',
  },

  // Roles
  {
    id: 'roles.create',
    group: 'Roles',
    label: 'Create roles',
    description: 'Define a new role with a custom capability set.',
  },
  {
    id: 'roles.edit',
    group: 'Roles',
    label: 'Edit roles',
    description: 'Rename a role or change its capabilities.',
  },
  {
    id: 'roles.delete',
    group: 'Roles',
    label: 'Delete roles',
    description: 'Delete a non-system role (only when no users hold it).',
  },
  {
    id: 'roles.assign',
    group: 'Roles',
    label: 'Assign roles',
    description: 'Move a user from one role to another.',
  },

  // Tickets
  {
    id: 'tickets.view_all',
    group: 'Tickets',
    label: 'View all tickets',
    description: 'See every ticket across the portal (not just own).',
  },
  {
    id: 'tickets.view_assigned',
    group: 'Tickets',
    label: 'View assigned tickets',
    description: 'See tickets where you are the assignee (Developer Portal).',
  },
  {
    id: 'tickets.assign',
    group: 'Tickets',
    label: 'Assign tickets',
    description: 'Set or change a ticket assignee.',
  },
  {
    id: 'tickets.reassign_any',
    group: 'Tickets',
    label: "Reassign anyone's ticket",
    description: 'Move a ticket off another person without their action.',
  },
  {
    id: 'tickets.status_change_any',
    group: 'Tickets',
    label: 'Change any ticket status',
    description: 'Move any ticket between workflow states.',
  },
  {
    id: 'tickets.status_change_own',
    group: 'Tickets',
    label: 'Change own ticket status',
    description: 'Move a ticket you are assigned to between workflow states.',
  },
  {
    id: 'tickets.delete',
    group: 'Tickets',
    label: 'Delete tickets',
    description: 'Permanently remove a ticket.',
  },
  {
    id: 'tickets.comment',
    group: 'Tickets',
    label: 'Comment on tickets',
    description: 'Post a message in a ticket conversation you are part of.',
  },
  {
    id: 'tickets.internal_notes',
    group: 'Tickets',
    label: 'Internal staff notes',
    description: 'Post and read the internal notes thread on tickets (admin tier only).',
  },
  {
    id: 'tickets.edit_all',
    group: 'Tickets',
    label: 'Edit all ticket fields',
    description:
      'Edit every field on a ticket after creation — title, description, category, priority, department, shop, platforms, and requester. Admin-only.',
  },
  {
    id: 'incidents.manage',
    group: 'Tickets',
    label: 'Manage incidents',
    description: 'Set severity, declare major incidents, post status updates, create postmortems.',
  },

  // Admin surfaces
  {
    id: 'audit.view',
    group: 'Admin',
    label: 'View audit log',
    description: 'Read the immutable action history.',
  },
  {
    id: 'feedback.view',
    group: 'Admin',
    label: 'View platform feedback',
    description: 'Read past AI assistant conversations.',
  },
  {
    id: 'docs.manage',
    group: 'Admin',
    label: 'Manage documentation',
    description: 'Create, edit, pin, or delete IT docs.',
  },
  {
    id: 'admin.kanban_view',
    group: 'Admin',
    label: 'View admin console',
    description: 'Open the Admin Console (system health, maintenance mode, queue stats).',
  },
  {
    id: 'catalog.manage',
    group: 'Admin',
    label: 'Manage service catalog',
    description: 'Create, edit, or retire service catalog request types.',
  },
  {
    id: 'sla.manage',
    group: 'Admin',
    label: 'Manage SLA policies',
    description: 'Edit per-priority response and resolution targets.',
  },
  {
    id: 'approvals.override',
    group: 'Admin',
    label: 'Override approvals',
    description: 'Decide approval requests addressed to someone else (unblock stuck requests).',
  },
  {
    id: 'reports.view',
    group: 'Admin',
    label: 'View reports',
    description: 'Open the KPI dashboard (trends, SLA compliance, CSAT, change success).',
  },
  {
    id: 'spaces.manage',
    group: 'Admin',
    label: 'Manage spaces & boards',
    description:
      'Create spaces and boards, set board keys, and manage space/board memberships portal-wide.',
  },

  // Problems & Changes
  {
    id: 'problems.manage',
    group: 'Problems & Changes',
    label: 'Manage problems',
    description: 'Create problem records, edit root cause/workaround, flag known errors.',
  },
  {
    id: 'changes.manage',
    group: 'Problems & Changes',
    label: 'Manage changes',
    description:
      'Create change requests, edit plans/windows, submit for approval, record outcomes.',
  },
  {
    id: 'changes.approve',
    group: 'Problems & Changes',
    label: 'Approve changes',
    description: 'Act as a change approver (CAB member).',
  },

  // Assets
  {
    id: 'assets.view',
    group: 'Assets',
    label: 'View assets',
    description: 'Browse the asset registry and see assignment history.',
  },
  {
    id: 'assets.manage',
    group: 'Assets',
    label: 'Manage assets',
    description: 'Create, edit, assign, return, retire, or delete assets.',
  },

  // System
  {
    id: 'system.impersonate',
    group: 'System',
    label: 'Impersonate users',
    description: 'Switch the active session view to another user (view-as).',
  },
  {
    id: 'system.maintenance_mode',
    group: 'System',
    label: 'Toggle maintenance mode',
    description: 'Enable or disable the portal-wide maintenance banner.',
  },
  {
    id: 'system.settings_edit',
    group: 'System',
    label: 'Edit portal settings',
    description: 'Change defaults like the default ticket assignee.',
  },
  {
    id: 'system.export_data',
    group: 'System',
    label: 'Export portal data',
    description: 'Download CSV/JSON snapshots of tickets, users, audit log.',
  },
]);

export const CAPABILITY_IDS = CAPABILITIES.map(c => c.id);
export const ALL_CAPABILITIES = Object.freeze(CAPABILITY_IDS.slice());

// ─── Seed roles (defaults baked at first boot) ────────────────────────────────
// `isSystem` roles are protected: cannot be deleted, cannot rename their
// machine `name`, and (for superadmin) cannot have capabilities removed.
// Exactly one role is `isDefault: true` — new users land there.
export const SEED_ROLES = Object.freeze([
  {
    id: 'role_superadmin',
    name: 'superadmin',
    label: 'Superadmin',
    description: 'Full access to every capability. Always omnipotent.',
    color: '#DC2626',
    isSystem: true,
    isDefault: false,
    capabilities: ALL_CAPABILITIES,
  },
  {
    id: 'role_admin',
    name: 'admin',
    label: 'Admin',
    description:
      'Day-to-day admin without root powers (no user delete, no role delete, no maintenance mode, no impersonation).',
    color: '#6366F1',
    isSystem: true,
    isDefault: false,
    capabilities: Object.freeze([
      'users.create',
      'users.edit',
      'users.promote',
      'users.demote',
      'roles.create',
      'roles.edit',
      'roles.assign',
      'tickets.view_all',
      'tickets.view_assigned',
      'tickets.assign',
      'tickets.reassign_any',
      'tickets.status_change_any',
      'tickets.status_change_own',
      'tickets.delete',
      'tickets.comment',
      'tickets.internal_notes',
      'tickets.edit_all',
      'incidents.manage',
      'problems.manage',
      'changes.manage',
      'changes.approve',
      'audit.view',
      'feedback.view',
      'docs.manage',
      'admin.kanban_view',
      'catalog.manage',
      'sla.manage',
      'approvals.override',
      'reports.view',
      'spaces.manage',
      'assets.view',
      'assets.manage',
      'system.settings_edit',
      'system.export_data',
    ]),
  },
  {
    id: 'role_developer',
    name: 'developer',
    label: 'Developer',
    description:
      'Engineering staff who work assigned tickets. Read-only across the portal, status changes only on own work.',
    color: '#16A34A',
    isSystem: true,
    isDefault: false,
    capabilities: Object.freeze([
      'tickets.view_all',
      'tickets.view_assigned',
      'tickets.status_change_own',
      'tickets.delete',
      'tickets.comment',
      'incidents.manage',
      'problems.manage',
      'changes.manage',
      'docs.manage',
      'assets.view',
      'reports.view',
    ]),
  },
  {
    id: 'role_user',
    name: 'user',
    label: 'User',
    description: 'Default role for everyone. Submit and comment on own tickets, browse docs.',
    color: '#52525B',
    isSystem: true,
    isDefault: true,
    capabilities: Object.freeze(['tickets.comment']),
  },
]);

// ─── Default assignee constant ────────────────────────────────────────────────
// Every new ticket lands assigned to this address until admin re-routes. The
// runtime can override via SETTINGS in localStorage (Roles & Access page).
export const DEFAULT_ASSIGNEE = Object.freeze({
  name: 'TechOps Queue',
  email: 'techops@pomelo.local',
});

// ─── Pure predicate ───────────────────────────────────────────────────────────
// hasPermission is the only check call-sites should perform. It deny-alls when
// the user is missing, has no roleId, or holds a deleted role — the last case
// matters because the Roles page can delete a custom role and the user's stale
// roleId would otherwise grant nothing-or-everything depending on legacy code.
export function hasPermission(user, capabilityId, roles) {
  if (!user || !user.roleId) return false;
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const role = roles.find(r => r.id === user.roleId);
  if (!role) return false;
  return role.capabilities.includes(capabilityId);
}

// Convenience for code that already has the role object in hand.
export function roleHasCapability(role, capabilityId) {
  if (!role || !Array.isArray(role.capabilities)) return false;
  return role.capabilities.includes(capabilityId);
}

// ─── Legacy → new role mapping ────────────────────────────────────────────────
// Used by the one-time migration in PomeloTechOpsPortal.jsx. Old user objects
// carry a `role: 'superadmin' | 'user'` string; new ones carry `roleId`.
export const LEGACY_ROLE_TO_ROLE_ID = Object.freeze({
  superadmin: 'role_superadmin',
  user: 'role_user',
});

// The default role id new users land in when no role is specified.
export const DEFAULT_ROLE_ID = 'role_user';

// Seed-user email rewrites applied by the one-time migration. Empty since the
// hardcoded personal seed accounts were removed; kept so the migration loop
// stays a no-op rather than a special case.
export const SEED_EMAIL_REWRITE = Object.freeze({});

// Bump this when the migration changes shape so future boots re-run it.
export const RBAC_SCHEMA_VERSION = 5;
