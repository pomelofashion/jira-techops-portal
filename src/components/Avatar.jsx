// src/components/Avatar.jsx
// One place for the "profile picture or initials circle" pattern. Resolves the
// picture from an explicit src, else the shared avatar registry (by email or
// name). Falls back to initials on a colored circle.

import { avatarForEmail, avatarForName } from '../lib/avatarRegistry.js';

const initialsOf = name =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';

export default function Avatar({ name, email, src, size = 32, bg, fontSize, style, title }) {
  const url = src || avatarForEmail(email) || avatarForName(name) || null;
  const base = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  };
  if (url) {
    return (
      <img
        src={url}
        alt={name || email || ''}
        title={title || name || email || undefined}
        style={{ ...base, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      title={title || name || email || undefined}
      style={{
        ...base,
        background: bg || 'var(--accent-primary)',
        color: '#fff',
        fontWeight: 700,
        fontSize: fontSize || `${Math.max(10, Math.round(size * 0.4))}px`,
      }}
    >
      {initialsOf(name || email)}
    </div>
  );
}
