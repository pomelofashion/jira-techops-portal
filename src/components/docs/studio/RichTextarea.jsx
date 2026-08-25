// src/components/docs/studio/RichTextarea.jsx
// A Markdown <textarea> with a Confluence-style formatting toolbar, a slash (/)
// command menu, a floating selection toolbar, smart list/table keystrokes,
// paste-HTML→Markdown, inline image paste/drop, and keyboard shortcuts.
// Produces Markdown — no contentEditable, no new dependencies.
// Used by the Documentation Studio editor.

import { useRef, useEffect, useState, useCallback } from 'react';
import { S } from '../../../lib/styles.js';
import { wrapSelection, prefixLines, insertBlock, BLOCK_SNIPPETS } from './editorActions.js';
import { htmlToMd } from '../../../lib/htmlToMd.js';
import { compressImageToDataUrl } from '../../../lib/imageUtil.js';
import { TEMPLATES } from './templates.js';

// Server caps doc content at 200,000 chars (server/routes/docs.js writeSchema).
// Refuse inserts that would push past the guard, and warn from the soft line.
export const CONTENT_MAX = 200000;
export const CONTENT_SOFT_WARN = 150000;
const CONTENT_INSERT_GUARD = 180000;

// Every command can be triggered from the toolbar and/or the slash menu.
// run(value, start, end) → { value, selStart, selEnd }
// `keywords` widens slash-menu filtering to synonyms.
const COMMANDS = [
  {
    id: 'h1',
    label: 'Heading 1',
    icon: 'H1',
    group: 'text',
    slash: true,
    keywords: 'title',
    run: (v, s, e) => prefixLines(v, s, e, '# '),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    icon: 'H2',
    group: 'text',
    slash: true,
    keywords: 'subtitle section',
    run: (v, s, e) => prefixLines(v, s, e, '## '),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    icon: 'H3',
    group: 'text',
    slash: true,
    keywords: 'subsection',
    run: (v, s, e) => prefixLines(v, s, e, '### '),
  },
  {
    id: 'bold',
    label: 'Bold',
    icon: 'B',
    group: 'inline',
    tip: '⌘B',
    run: (v, s, e) => wrapSelection(v, s, e, '**', '**', 'bold text'),
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: 'I',
    group: 'inline',
    tip: '⌘I',
    run: (v, s, e) => wrapSelection(v, s, e, '*', '*', 'italic text'),
  },
  {
    id: 'underline',
    label: 'Underline',
    icon: 'U',
    group: 'inline',
    run: (v, s, e) => wrapSelection(v, s, e, '++', '++', 'underline'),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    icon: 'S̶',
    group: 'inline',
    run: (v, s, e) => wrapSelection(v, s, e, '~~', '~~', 'strikethrough'),
  },
  {
    id: 'code',
    label: 'Inline code',
    icon: '</>',
    group: 'inline',
    keywords: 'mono',
    run: (v, s, e) => wrapSelection(v, s, e, '`', '`', 'code'),
  },
  {
    id: 'link',
    label: 'Link',
    icon: '🔗',
    group: 'inline',
    tip: '⌘K',
    slash: true,
    keywords: 'url href',
    run: (v, s, e) => {
      const sel = v.slice(s, e) || 'link text';
      const txt = `[${sel}](https://)`;
      return {
        value: v.slice(0, s) + txt + v.slice(e),
        selStart: s + sel.length + 3,
        selEnd: s + sel.length + 11,
      };
    },
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    icon: '•',
    group: 'list',
    slash: true,
    keywords: 'ul unordered',
    run: (v, s, e) => prefixLines(v, s, e, '- '),
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    icon: '1.',
    group: 'list',
    slash: true,
    keywords: 'ol ordered',
    run: (v, s, e) => prefixLines(v, s, e, '', true),
  },
  {
    id: 'task',
    label: 'Task list',
    icon: '☑',
    group: 'list',
    slash: true,
    keywords: 'todo checkbox checklist',
    run: (v, s, e) => prefixLines(v, s, e, '- [ ] '),
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: '❝',
    group: 'block',
    slash: true,
    keywords: 'blockquote cite',
    run: (v, s, e) => prefixLines(v, s, e, '> '),
  },
  {
    id: 'codeblock',
    label: 'Code block',
    icon: '{ }',
    group: 'block',
    slash: true,
    keywords: 'snippet fence pre',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.codeblock),
  },
  {
    id: 'table',
    label: 'Table',
    icon: '▦',
    group: 'block',
    slash: true,
    keywords: 'grid columns rows',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.table),
  },
  {
    id: 'info',
    label: 'Info panel',
    icon: 'ℹ️',
    group: 'callout',
    slash: true,
    keywords: 'callout panel',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.info),
  },
  {
    id: 'note',
    label: 'Note panel',
    icon: '📝',
    group: 'callout',
    slash: true,
    keywords: 'callout remember',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.note),
  },
  {
    id: 'warning',
    label: 'Warning panel',
    icon: '⚠️',
    group: 'callout',
    slash: true,
    keywords: 'callout warn caution',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.warning),
  },
  {
    id: 'success',
    label: 'Success panel',
    icon: '✅',
    group: 'callout',
    slash: true,
    keywords: 'callout done win',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.success),
  },
  {
    id: 'error',
    label: 'Error panel',
    icon: '⛔',
    group: 'callout',
    slash: true,
    keywords: 'callout danger avoid',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.error),
  },
  {
    id: 'tip',
    label: 'Tip panel',
    icon: '💡',
    group: 'callout',
    slash: true,
    keywords: 'callout hint',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.tip),
  },
  {
    id: 'image',
    label: 'Image',
    icon: '🖼️',
    group: 'block',
    slash: true,
    keywords: 'picture photo',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.image),
  },
  {
    id: 'divider',
    label: 'Divider',
    icon: '―',
    group: 'block',
    slash: true,
    keywords: 'hr line separator rule',
    run: (v, s, e) => insertBlock(v, s, e, BLOCK_SNIPPETS.divider),
  },
  {
    id: 'date',
    label: "Today's date",
    icon: '📅',
    group: 'block',
    slash: true,
    keywords: 'time stamp today now',
    run: (v, s, e) => {
      const d = new Date().toISOString().slice(0, 10);
      return {
        value: v.slice(0, s) + d + v.slice(e),
        selStart: s + d.length,
        selEnd: s + d.length,
      };
    },
  },
];

// Starter templates double as slash-insertable snippets (/template-runbook…).
const TEMPLATE_COMMANDS = TEMPLATES.filter(t => t.id !== 'blank' && t.content).map(t => ({
  id: `template-${t.id}`,
  label: `Template: ${t.name}`,
  icon: '📋',
  group: 'template',
  slash: true,
  keywords: `template snippet ${t.id}`,
  run: (v, s, e) => insertBlock(v, s, e, t.content),
}));

const ALL_COMMANDS = [...COMMANDS, ...TEMPLATE_COMMANDS];
const CMD = Object.fromEntries(ALL_COMMANDS.map(c => [c.id, c]));
const SLASH_COMMANDS = ALL_COMMANDS.filter(c => c.slash);

const TOOLBAR_GROUPS = [
  ['h1', 'h2', 'h3'],
  ['bold', 'italic', 'underline', 'strike', 'code'],
  ['bullet', 'numbered', 'task'],
  ['link', 'quote', 'codeblock', 'table'],
  ['info', 'warning', 'success', 'image', 'divider'],
];

const btnStyle = { ...S.toolbarBtn }; // shared token — see src/lib/styles.js

const LIST_PREFIX_RE = /^(\s*)([-*](?:\s\[[ x]\])?|\d+\.)\s(.*)$/;
const TABLE_ROW_RE = /^\|.*\|\s*$/;
const BLOCK_HTML_RE = /<(h[1-6]|p|ul|ol|li|table|blockquote|pre)\b/i;

export default function RichTextarea({
  value,
  onChange,
  placeholder,
  style,
  taRef: externalRef,
  onNotify,
  onScroll,
}) {
  const innerRef = useRef(null);
  const taRef = externalRef || innerRef;
  const pendingSel = useRef(null);
  const [slash, setSlash] = useState(null); // { query, from, top, left, index } | null
  const [bubble, setBubble] = useState(null); // { top, left } | null

  // Restore caret/selection after a programmatic value change.
  useEffect(() => {
    if (pendingSel.current && taRef.current) {
      const { selStart, selEnd } = pendingSel.current;
      taRef.current.focus();
      taRef.current.setSelectionRange(selStart, selEnd);
      pendingSel.current = null;
    }
  });

  const apply = useCallback(
    cmd => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const res = cmd.run(value, start, end);
      pendingSel.current = { selStart: res.selStart, selEnd: res.selEnd };
      onChange(res.value);
    },
    [value, onChange, taRef]
  );

  // Native-undo-friendly insertion: execCommand keeps the textarea's built-in
  // undo stack; setRangeText is the fallback when a browser refuses it.
  const insertNative = useCallback(
    (text, selStart, selEnd) => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      if (selStart != null) ta.setSelectionRange(selStart, selEnd != null ? selEnd : selStart);
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, text);
      } catch {
        ok = false;
      }
      if (!ok) {
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
        onChange(ta.value);
      }
    },
    [onChange, taRef]
  );

  const deleteRangeNative = useCallback(
    (from, to) => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(from, to);
      let ok = false;
      try {
        ok = document.execCommand('delete', false);
      } catch {
        ok = false;
      }
      if (!ok) {
        ta.setRangeText('', from, to, 'end');
        onChange(ta.value);
      }
    },
    [onChange, taRef]
  );

  // Compress + inline an image as a Markdown data-URL image.
  const insertImageFile = useCallback(
    async file => {
      try {
        const dataUrl = await compressImageToDataUrl(file);
        const name =
          (file.name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[[\]()]/g, '') || 'image';
        const snippet = `\n\n![${name}](${dataUrl})\n\n`;
        if (value.length + snippet.length > CONTENT_INSERT_GUARD) {
          onNotify?.(
            'Image too large to embed in this page — upload it via the Documentation library instead.',
            'error'
          );
          return;
        }
        insertNative(snippet);
      } catch {
        onNotify?.('Could not read that image.', 'error');
      }
    },
    [value, insertNative, onNotify]
  );

  const filtered = slash
    ? SLASH_COMMANDS.filter(c =>
        `${c.label} ${c.keywords || ''} ${c.id}`.toLowerCase().includes(slash.query.toLowerCase())
      )
    : [];

  const runSlash = useCallback(
    cmd => {
      const ta = taRef.current;
      if (!ta || !slash) return;
      // Remove the "/query" trigger text, then run the command at that spot.
      const caret = ta.selectionStart;
      const cleaned = value.slice(0, slash.from) + value.slice(caret);
      const res = cmd.run(cleaned, slash.from, slash.from);
      pendingSel.current = { selStart: res.selStart, selEnd: res.selEnd };
      onChange(res.value);
      setSlash(null);
    },
    [slash, value, onChange, taRef]
  );

  // Next/previous pipe-table cell relative to `from`; returns trimmed [start, end].
  const nextCell = from => {
    let q = value.indexOf('|', from);
    while (q !== -1) {
      const end = value.indexOf('|', q + 1);
      if (end === -1) return null;
      const seg = value.slice(q + 1, end);
      if (!seg.includes('\n')) {
        let a = q + 1;
        let b = end;
        while (a < b && /\s/.test(value[a])) a++;
        while (b > a && /\s/.test(value[b - 1])) b--;
        return [a, b];
      }
      q = end;
    }
    return null;
  };
  const prevCell = from => {
    let r = value.lastIndexOf('|', from - 1);
    while (r > 0) {
      const p = value.lastIndexOf('|', r - 1);
      if (p === -1) return null;
      const seg = value.slice(p + 1, r);
      if (!seg.includes('\n')) {
        let a = p + 1;
        let b = r;
        while (a < b && /\s/.test(value[a])) a++;
        while (b > a && /\s/.test(value[b - 1])) b--;
        return [a, b];
      }
      r = p;
    }
    return null;
  };

  const onKeyDown = e => {
    // Slash-menu navigation takes priority when open.
    if (slash && filtered.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlash(s => ({ ...s, index: (s.index + 1) % filtered.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlash(s => ({ ...s, index: (s.index - 1 + filtered.length) % filtered.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        runSlash(filtered[slash.index] || filtered[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }
    if (e.key === 'Escape' && bubble) {
      setBubble(null);
      return;
    }
    const ta = e.target;
    const caret = ta.selectionStart;
    const collapsed = caret === ta.selectionEnd;

    // Smart list continuation / table rows on Enter.
    if (e.key === 'Enter' && collapsed && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
      let lineEnd = value.indexOf('\n', caret);
      if (lineEnd === -1) lineEnd = value.length;
      const fullLine = value.slice(lineStart, lineEnd);

      // Enter at the end of a table row → new empty row with same column count.
      if (TABLE_ROW_RE.test(fullLine) && caret === lineEnd) {
        e.preventDefault();
        const cols = Math.max(1, fullLine.split('|').length - 2);
        insertNative('\n|' + ' |'.repeat(cols));
        return;
      }

      const beforeCaret = value.slice(lineStart, caret);
      const m = beforeCaret.match(LIST_PREFIX_RE);
      if (m) {
        e.preventDefault();
        if (!m[3].trim()) {
          // Empty list item → exit the list (remove the dangling prefix).
          deleteRangeNative(lineStart, caret);
          return;
        }
        let prefix = m[2];
        const num = prefix.match(/^(\d+)\.$/);
        if (num) prefix = `${Number(num[1]) + 1}.`;
        prefix = prefix.replace('[x]', '[ ]');
        insertNative(`\n${m[1]}${prefix} `);
        return;
      }
    }

    // Tab / Shift+Tab hop between table cells.
    if (e.key === 'Tab' && collapsed) {
      const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
      let lineEnd = value.indexOf('\n', caret);
      if (lineEnd === -1) lineEnd = value.length;
      if (TABLE_ROW_RE.test(value.slice(lineStart, lineEnd))) {
        const cell = e.shiftKey ? prevCell(caret) : nextCell(caret);
        if (cell) {
          e.preventDefault();
          ta.setSelectionRange(cell[0], cell[1]);
          return;
        }
      }
    }

    // Keyboard shortcuts.
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        apply(CMD.bold);
        return;
      }
      if (k === 'i') {
        e.preventDefault();
        apply(CMD.italic);
        return;
      }
      if (k === 'k') {
        e.preventDefault();
        apply(CMD.link);
        return;
      }
    }
  };

  // Detect / update the slash trigger as the user types.
  const handleChange = e => {
    const ta = e.target;
    const caret = ta.selectionStart;
    const val = ta.value;
    onChange(val);
    // Find a "/" that starts a command token: preceded by start-of-line or space.
    const uptoCaret = val.slice(0, caret);
    const m = uptoCaret.match(/(^|\s)\/([\w-]*)$/);
    if (m) {
      const from = caret - m[2].length - 1; // position of "/"
      const coords = caretCoords(ta, from);
      setSlash({ query: m[2], from, index: 0, top: coords.top, left: coords.left });
    } else if (slash) {
      setSlash(null);
    }
  };

  // Floating selection toolbar: show a formatting bubble over the selection.
  const updateBubble = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (ta.selectionEnd > ta.selectionStart && document.activeElement === ta) {
      const c = caretCoords(ta, ta.selectionStart);
      // Prefer floating above the selection; flip below when that would sit on
      // top of the static toolbar (which would swallow its clicks).
      const above = c.top - 46;
      setBubble({ top: above >= 44 ? above : c.top + 26, left: Math.min(c.left, 420) });
    } else if (bubble) {
      setBubble(null);
    }
  };

  // Paste: images become inline data-URLs; rich HTML converts to Markdown.
  const onPaste = e => {
    const cd = e.clipboardData;
    if (!cd) return;
    const imgFile = Array.from(cd.files || []).find(f => f.type.startsWith('image/'));
    if (imgFile) {
      e.preventDefault();
      insertImageFile(imgFile);
      return;
    }
    const html = cd.getData('text/html');
    if (html && BLOCK_HTML_RE.test(html)) {
      const md = htmlToMd(html);
      if (md) {
        e.preventDefault();
        insertNative(md);
      }
    }
  };

  const onDrop = e => {
    const f = Array.from(e.dataTransfer?.files || []).find(x => x.type.startsWith('image/'));
    if (f) {
      e.preventDefault();
      insertImageFile(f);
    }
  };
  const onDragOver = e => {
    if (Array.from(e.dataTransfer?.items || []).some(x => x.kind === 'file')) e.preventDefault();
  };

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* Toolbar — always visible: the textarea scrolls internally below it. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '2px',
          alignItems: 'center',
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
        }}
      >
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div
            key={gi}
            style={{
              display: 'flex',
              gap: '1px',
              alignItems: 'center',
              paddingRight: '6px',
              marginRight: '4px',
              borderRight:
                gi < TOOLBAR_GROUPS.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}
          >
            {group.map(id => {
              const c = CMD[id];
              return (
                <button
                  key={id}
                  type="button"
                  title={c.label + (c.tip ? ` (${c.tip})` : '')}
                  onMouseDown={e => {
                    e.preventDefault();
                    apply(c);
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  style={{
                    ...btnStyle,
                    fontStyle: id === 'italic' ? 'italic' : 'normal',
                    textDecoration: id === 'strike' ? 'line-through' : 'none',
                  }}
                >
                  {c.icon}
                </button>
              );
            })}
          </div>
        ))}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Type <b>/</b> for blocks · paste or drop images
        </span>
      </div>

      {/* Editing surface */}
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onSelect={updateBubble}
        onBlur={() => setBubble(null)}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onScroll={() => {
          if (slash) setSlash(null);
          if (bubble) setBubble(null);
          onScroll?.();
        }}
        placeholder={placeholder}
        spellCheck
        style={{
          flex: 1,
          resize: 'none',
          border: 'none',
          outline: 'none',
          padding: '18px 20px',
          fontSize: '13px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          lineHeight: 1.7,
          background: 'var(--bg-page)',
          color: 'var(--text-primary)',
          ...style,
        }}
      />

      {/* Footer: word count, reading time, content budget */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          padding: '4px 12px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}
      >
        <span>
          {words.toLocaleString()} words · {Math.max(1, Math.ceil(words / 200))} min read
        </span>
        {value.length > CONTENT_SOFT_WARN && (
          <span style={{ color: '#D97706', fontWeight: 700 }}>
            {Math.round(value.length / 1000)}K / {CONTENT_MAX / 1000}K chars
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>Markdown</span>
      </div>

      {/* Floating selection toolbar */}
      {bubble && (
        <div
          role="toolbar"
          aria-label="Format selection"
          style={{
            position: 'absolute',
            top: bubble.top,
            left: bubble.left,
            zIndex: 60,
            display: 'flex',
            gap: '1px',
            padding: '3px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {['bold', 'italic', 'code', 'link'].map(id => {
            const c = CMD[id];
            return (
              <button
                key={id}
                type="button"
                title={c.label + (c.tip ? ` (${c.tip})` : '')}
                onMouseDown={e => {
                  e.preventDefault();
                  apply(c);
                  setBubble(null);
                }}
                style={{
                  ...btnStyle,
                  fontStyle: id === 'italic' ? 'italic' : 'normal',
                }}
              >
                {c.icon}
              </button>
            );
          })}
        </div>
      )}

      {/* Slash command menu */}
      {slash && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: Math.min(slash.top + 4, 360),
            left: Math.min(slash.left, 280),
            zIndex: 50,
            width: '230px',
            maxHeight: '280px',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            padding: '6px',
          }}
        >
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                runSlash(c);
              }}
              onMouseEnter={() => setSlash(s => ({ ...s, index: i }))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 9px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: i === slash.index ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span
                style={{
                  width: '24px',
                  height: '24px',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: 'var(--bg-hover)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                {c.icon}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  fontWeight: i === slash.index ? 700 : 500,
                }}
              >
                {c.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Rough caret pixel position inside the textarea using a mirror element.
// Good enough to anchor the slash menu near the cursor.
function caretCoords(textarea, position) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  const props = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'borderWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'whiteSpace',
    'wordWrap',
  ];
  props.forEach(p => {
    div.style[p] = style[p];
  });
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.textContent = textarea.value.slice(0, position);
  const span = document.createElement('span');
  span.textContent = textarea.value.slice(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop - textarea.scrollTop;
  const left = span.offsetLeft;
  document.body.removeChild(div);
  return { top: top + 30, left: left + 8 };
}
