// src/lib/avatarRegistry.js
// Module-level email → avatarUrl map so any surface that only knows a user's
// email (or name) can show their profile picture without threading avatar data
// through every prop. Populated from the users list, the current user, Jira
// assignable users, and any server payload that carries an avatar (e.g. ticket
// comments). Missing entries just fall back to initials.

const byEmail = new Map();
const byName = new Map();

const norm = s =>
  String(s || '')
    .trim()
    .toLowerCase();

export function registerAvatar(email, name, url) {
  if (!url) return;
  if (email) byEmail.set(norm(email), url);
  if (name) byName.set(norm(name), url);
}

// Accepts an array of user-ish objects ({email,name,avatarUrl}).
export function registerAvatars(users) {
  if (!Array.isArray(users)) return;
  for (const u of users) {
    if (u && u.avatarUrl) registerAvatar(u.email, u.name, u.avatarUrl);
  }
}

export const avatarForEmail = email => (email ? byEmail.get(norm(email)) || null : null);
export const avatarForName = name => (name ? byName.get(norm(name)) || null : null);

// Best-effort: prefer email, fall back to name.
export const avatarFor = ({ email, name } = {}) =>
  avatarForEmail(email) || avatarForName(name) || null;
