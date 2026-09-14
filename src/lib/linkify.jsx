// src/lib/linkify.jsx
// Turns bare URLs in plain text into clickable links that open in a new tab.
// Used by every free-text renderer (ticket description / results / chat /
// notes, and MarkdownView's plain segments) so pasted work-page links, Drive
// and Superset URLs, etc. are clickable. Markdown [text](url) links are handled
// separately by MarkdownView; this only catches raw URLs.

import React from 'react';

// http/https URL up to the first whitespace or angle bracket; trailing
// sentence punctuation is trimmed so "see https://x.com." doesn't include the
// period, and a balanced-ish trailing ) is kept only when the URL has a "(".
const URL_RE = /(https?:\/\/[^\s<>]+)/gi;

const linkStyle = {
  color: 'var(--accent-primary)',
  textDecoration: 'underline',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function trimTrailing(url) {
  let u = url;
  // Strip trailing punctuation that's almost never part of the URL.
  const m = u.match(/[.,;:!?]+$/);
  if (m) u = u.slice(0, -m[0].length);
  // Drop an unbalanced closing paren (common when URLs sit in prose).
  if (u.endsWith(')') && !u.includes('(')) u = u.slice(0, -1);
  return u;
}

// Returns an array of strings + <a> nodes (or the original string if no URLs).
export function linkify(text, keyPrefix = 'lk') {
  const s = String(text ?? '');
  if (!s) return s;
  const out = [];
  let last = 0;
  let i = 0;
  const re = new RegExp(URL_RE);
  let m;
  while ((m = re.exec(s))) {
    const raw = m[0];
    const url = trimTrailing(raw);
    const start = m.index;
    if (start > last) out.push(s.slice(last, start));
    out.push(
      React.createElement(
        'a',
        {
          key: `${keyPrefix}-${i++}`,
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: linkStyle,
          onClick: e => e.stopPropagation(),
        },
        url
      )
    );
    last = start + url.length;
    // Advance the regex past any trailing chars we trimmed.
    if (url.length < raw.length) re.lastIndex = start + raw.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.length ? out : s;
}
