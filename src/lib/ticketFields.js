// src/lib/ticketFields.js
// The whitelist of ticket "content" fields that the structured ticket layout
// can show. Admins configure which appear, their order, labels, and whether
// each is editable — but every field binds to a real ticket column (no
// arbitrary per-ticket fields). Shared by the ticket detail and the admin
// editor so both agree on what's bindable.
//   perm: 'fields' → editable by the assignee or tickets.view_all holders
//         'all'    → editable only by tickets.edit_all holders
//   multiline → render/edit as a textarea
//   rich → render (read-only) through renderRichDescription (keeps catalog
//          "**Label**" answers as sub-headers)

export const TICKET_FIELD_DEFS = {
  requesterEmail: { defaultLabel: 'Requester Email', multiline: false, perm: 'all' },
  requesterName: { defaultLabel: 'Requester Name', multiline: false, perm: 'all' },
  title: { defaultLabel: 'Title', multiline: false, perm: 'all' },
  description: { defaultLabel: 'Description', multiline: true, perm: 'fields', rich: true },
  currentResult: { defaultLabel: 'Current Result', multiline: true, perm: 'fields' },
  expectedResult: { defaultLabel: 'Expected Result', multiline: true, perm: 'fields' },
  department: { defaultLabel: 'Department', multiline: false, perm: 'all' },
  shop: { defaultLabel: 'Shop', multiline: false, perm: 'all' },
  category: { defaultLabel: 'Category', multiline: false, perm: 'all' },
};

export const TICKET_FIELD_KEYS = Object.keys(TICKET_FIELD_DEFS);

// The default configuration seeded on a fresh install / when no row exists.
export const DEFAULT_TICKET_FIELDS = [
  'requesterEmail',
  'requesterName',
  'title',
  'description',
  'currentResult',
  'expectedResult',
].map(key => ({ key, label: TICKET_FIELD_DEFS[key].defaultLabel, visible: true, editable: true }));

// Read a field's value off a client ticket object (requester is nested).
export function readFieldValue(ticket, key) {
  if (!ticket) return '';
  if (key === 'requesterEmail') return ticket.requester?.email || '';
  if (key === 'requesterName') return ticket.requester?.name || '';
  return ticket[key] || '';
}

// Build the patch object for a field edit. requester* go through patchRequester
// (nested locally, two columns server-side); everything else is a flat column.
export function patchForField(key, value) {
  if (key === 'requesterEmail') return { requester: true, requesterEmail: value };
  if (key === 'requesterName') return { requester: true, requesterName: value };
  return { [key]: value };
}
