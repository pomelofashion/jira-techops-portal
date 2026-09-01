// src/components/docs/MarkdownView.jsx
// Shared Markdown renderer for the Pomelo TechOps documentation system.
// One renderer powers the doc read views, the Documentation Studio preview,
// and the legacy edit modal so formatting is identical everywhere.
//
// Supported blocks:
//   # / ## / ### / ####   headings (h1 optionally skipped when a title header
//                          is already shown by the surrounding chrome)
//   - / *                  bullet list           1. 2.    numbered list
//   - [ ] / - [x]          task list             > quote  blockquote
//   ```lang … ```          fenced code block (with language label)
//   :::info … :::          callout panels (info | note | tip | success | warning | error)
//   | a | b |              tables (header row + --- separator + data rows)
//   ---                    horizontal rule       ![alt](url)  block image
//
// Supported inline:
//   **bold**  *italic*  _italic_  ++underline++  ~~strike~~  `code`
//   [text](url)  ![alt](url)
//
// Stays a pure-React renderer (no dangerouslySetInnerHTML, no new deps).

// ─── Helpers shared with the Table of Contents (Sprint 4) ─────────────────────
export const slugify = text =>
  String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64);

// Returns [{ level, text, id }] for every heading — used by the outline panel.
export const extractHeadings = content => {
  const out = [];
  let inFence = false;
  (content || '').split('\n').forEach(line => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), id: slugify(m[2].trim()) });
  });
  return out;
};

const CALLOUTS = {
  info: { icon: 'ℹ️', bg: 'rgba(59, 130, 246, 0.12)', border: '#3B82F6' },
  note: { icon: '📝', bg: 'var(--bg-hover)', border: 'var(--border-strong)' },
  tip: { icon: '💡', bg: 'rgba(22, 163, 74, 0.12)', border: '#16A34A' },
  success: { icon: '✅', bg: 'rgba(22, 163, 74, 0.12)', border: '#16A34A' },
  warning: { icon: '⚠️', bg: 'rgba(245, 158, 11, 0.12)', border: '#F59E0B' },
  error: { icon: '❌', bg: 'rgba(220, 38, 38, 0.10)', border: '#DC2626' },
};

// ─── Inline formatting ────────────────────────────────────────────────────────
// Order matters: images and links before emphasis so their brackets are not
// mistaken for other tokens.
const INLINE_RE =
  /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\+\+[^+]+\+\+|\*[^*\n]+\*|_[^_\n]+_)/g;

const codeStyle = {
  background: 'var(--bg-hover)',
  padding: '1px 5px',
  borderRadius: '4px',
  fontSize: '13px',
  fontFamily: 'monospace',
};

export function renderInline(text) {
  if (text == null) return null;
  const parts = String(text).split(INLINE_RE);
  return parts.map((part, j) => {
    if (!part) return null;
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img)
      return (
        <img
          key={j}
          src={img[2]}
          alt={img[1]}
          style={{
            maxWidth: '100%',
            borderRadius: '6px',
            verticalAlign: 'middle',
            margin: '2px 0',
          }}
        />
      );
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link)
      return (
        <a
          key={j}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
        >
          {link[1]}
        </a>
      );
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={j} style={codeStyle}>
          {part.slice(1, -1)}
        </code>
      );
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>;
    if (/^~~[^~]+~~$/.test(part)) return <del key={j}>{part.slice(2, -2)}</del>;
    if (/^\+\+[^+]+\+\+$/.test(part)) return <u key={j}>{part.slice(2, -2)}</u>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
    if (/^_[^_]+_$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
    return part;
  });
}

// ─── Block renderer ─────────────────────────────────────────────────────────
export function MarkdownView({ content, skipH1 = false, style }) {
  if (!content) return null;
  const lines = String(content).split('\n');
  const elements = [];

  let bulletBuf = [];
  let numberBuf = [];
  let taskBuf = [];
  let tableBuf = [];
  let codeLines = [];
  let codeLang = '';
  let inCode = false;
  let calloutType = null;
  let calloutLines = [];

  const flushBullets = () => {
    if (!bulletBuf.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} style={{ paddingLeft: '22px', margin: '8px 0 14px' }}>
        {bulletBuf.map((item, j) => (
          <li
            key={j}
            style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              lineHeight: 1.7,
              marginBottom: '4px',
            }}
          >
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
    bulletBuf = [];
  };
  const flushNumbers = () => {
    if (!numberBuf.length) return;
    elements.push(
      <ol key={`ol-${elements.length}`} style={{ paddingLeft: '22px', margin: '8px 0 14px' }}>
        {numberBuf.map((item, j) => (
          <li
            key={j}
            style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              lineHeight: 1.7,
              marginBottom: '4px',
            }}
          >
            {renderInline(item)}
          </li>
        ))}
      </ol>
    );
    numberBuf = [];
  };
  const flushTasks = () => {
    if (!taskBuf.length) return;
    elements.push(
      <div key={`tasks-${elements.length}`} style={{ margin: '8px 0 14px' }}>
        {taskBuf.map((t, j) => (
          <div
            key={j}
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '5px',
              fontSize: '14px',
              color: 'var(--text-primary)',
              lineHeight: 1.6,
            }}
          >
            <span style={{ flexShrink: 0, color: t.done ? '#16A34A' : 'var(--border-strong)' }}>
              {t.done ? '☑' : '☐'}
            </span>
            <span
              style={{
                textDecoration: t.done ? 'line-through' : 'none',
                opacity: t.done ? 0.65 : 1,
              }}
            >
              {renderInline(t.text)}
            </span>
          </div>
        ))}
      </div>
    );
    taskBuf = [];
  };
  const flushTable = () => {
    if (!tableBuf.length) {
      return;
    }
    const rows = tableBuf;
    tableBuf = [];
    const parseCells = line =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(c => c.trim());
    // rows[0] = header, rows[1] = separator (already filtered out below)
    const header = parseCells(rows[0]);
    const body = rows.slice(1).map(parseCells);
    elements.push(
      <div key={`tbl-${elements.length}`} style={{ overflowX: 'auto', margin: '12px 0 16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            <tr>
              {header.map((c, j) => (
                <th
                  key={j}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: 'var(--bg-hover)',
                    borderBottom: '2px solid var(--border-strong)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                  }}
                >
                  {renderInline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((cells, r) => (
              <tr key={r}>
                {cells.map((c, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {renderInline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const flushCode = () => {
    if (!codeLines.length && !inCode) return;
    elements.push(
      <div
        key={`code-${elements.length}`}
        style={{
          margin: '10px 0 16px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid var(--border-default)',
        }}
      >
        {codeLang && (
          <div
            style={{
              background: 'var(--bg-hover)',
              padding: '5px 14px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-default)',
              textTransform: 'lowercase',
            }}
          >
            {codeLang}
          </div>
        )}
        <pre
          style={{
            background: 'var(--bg-page)',
            padding: '14px 16px',
            overflowX: 'auto',
            fontSize: '13px',
            fontFamily: 'monospace',
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {codeLines.join('\n')}
        </pre>
      </div>
    );
    codeLines = [];
    codeLang = '';
  };
  const flushCallout = () => {
    if (calloutType == null) return;
    const cfg = CALLOUTS[calloutType] || CALLOUTS.info;
    const body = calloutLines.join('\n');
    elements.push(
      <div
        key={`callout-${elements.length}`}
        style={{
          display: 'flex',
          gap: '10px',
          background: cfg.bg,
          borderLeft: `4px solid ${cfg.border}`,
          borderRadius: '8px',
          padding: '12px 14px',
          margin: '12px 0 16px',
        }}
      >
        <span style={{ fontSize: '16px', flexShrink: 0, lineHeight: 1.5 }}>{cfg.icon}</span>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
          {body.split('\n').map((l, j) => (
            <div key={j}>{renderInline(l)}</div>
          ))}
        </div>
      </div>
    );
    calloutType = null;
    calloutLines = [];
  };
  const flushInlineBuffers = () => {
    flushBullets();
    flushNumbers();
    flushTasks();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Fenced code block ──
    if (/^```/.test(line)) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushInlineBuffers();
        inCode = true;
        codeLang = line.replace(/^```/, '').trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // ── Callout panel ──
    const calloutOpen = line.match(/^:::\s*(info|note|tip|success|warning|error)\s*$/i);
    if (calloutType == null && calloutOpen) {
      flushInlineBuffers();
      calloutType = calloutOpen[1].toLowerCase();
      continue;
    }
    if (calloutType != null) {
      if (/^:::\s*$/.test(line)) {
        flushCallout();
      } else {
        calloutLines.push(line);
      }
      continue;
    }

    // ── Table (header row followed by a |---| separator) ──
    const isTableRow = /^\|.*\|\s*$/.test(line.trim());
    const nextIsSep = i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1].trim());
    if (tableBuf.length === 0 && isTableRow && nextIsSep) {
      flushBullets();
      flushNumbers();
      flushTasks();
      tableBuf.push(line); // header
      i++; // skip separator row
      continue;
    }
    if (tableBuf.length > 0) {
      if (isTableRow) {
        tableBuf.push(line);
        continue;
      }
      flushTable(); // table ended — fall through to handle current line
    }

    // ── Headings ──
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushInlineBuffers();
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && skipH1) continue;
      const id = slugify(text);
      const styles = {
        1: {
          fontSize: '22px',
          fontWeight: 900,
          margin: '24px 0 12px',
          color: 'var(--text-primary)',
        },
        2: {
          fontSize: '18px',
          fontWeight: 800,
          margin: '22px 0 10px',
          color: 'var(--text-primary)',
          borderBottom: '2px solid var(--accent-primary)',
          paddingBottom: '6px',
        },
        3: {
          fontSize: '15px',
          fontWeight: 700,
          margin: '18px 0 6px',
          color: 'var(--text-primary)',
        },
        4: {
          fontSize: '13px',
          fontWeight: 700,
          margin: '14px 0 4px',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        },
      }[level];
      const Tag = `h${level}`;
      elements.push(
        <Tag key={i} id={id} style={styles}>
          {renderInline(text)}
        </Tag>
      );
      continue;
    }

    // ── Blockquote ──
    if (/^>\s?/.test(line)) {
      flushInlineBuffers();
      elements.push(
        <blockquote
          key={i}
          style={{
            borderLeft: '4px solid var(--accent-primary)',
            paddingLeft: '14px',
            margin: '10px 0',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            fontSize: '14px',
            lineHeight: 1.7,
          }}
        >
          {renderInline(line.replace(/^>\s?/, ''))}
        </blockquote>
      );
      continue;
    }

    // ── Task list ──
    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      flushBullets();
      flushNumbers();
      taskBuf.push({ done: task[1].toLowerCase() === 'x', text: task[2] });
      continue;
    }

    // ── Bullet list ──
    if (/^[-*]\s+/.test(line)) {
      flushNumbers();
      flushTasks();
      bulletBuf.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }

    // ── Numbered list ──
    if (/^\d+\.\s+/.test(line)) {
      flushBullets();
      flushTasks();
      numberBuf.push(line.replace(/^\d+\.\s+/, ''));
      continue;
    }

    // ── Horizontal rule ──
    if (/^([-_*])\1{2,}$/.test(line.trim())) {
      flushInlineBuffers();
      elements.push(
        <hr
          key={i}
          style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '20px 0' }}
        />
      );
      continue;
    }

    // ── Standalone block image ──
    const imgBlock = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgBlock) {
      flushInlineBuffers();
      elements.push(
        <div key={i} style={{ margin: '16px 0', textAlign: 'center' }}>
          <img
            src={imgBlock[2]}
            alt={imgBlock[1]}
            style={{
              maxWidth: '100%',
              maxHeight: '520px',
              objectFit: 'contain',
              borderRadius: '8px',
              border: '1px solid var(--border-default)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onError={e => {
              e.target.style.display = 'none';
            }}
          />
          {imgBlock[1] && (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginTop: '6px',
                fontStyle: 'italic',
              }}
            >
              {imgBlock[1]}
            </p>
          )}
        </div>
      );
      continue;
    }

    // ── Empty line ──
    if (line.trim() === '') {
      flushInlineBuffers();
      elements.push(<div key={i} style={{ height: '10px' }} />);
      continue;
    }

    // ── Paragraph ──
    flushInlineBuffers();
    elements.push(
      <p
        key={i}
        style={{
          fontSize: '14px',
          color: 'var(--text-primary)',
          lineHeight: 1.8,
          marginBottom: '10px',
        }}
      >
        {renderInline(line)}
      </p>
    );
  }

  // Flush any open buffers at EOF.
  flushInlineBuffers();
  if (inCode) flushCode();
  flushCallout();

  return <div style={{ color: 'var(--text-secondary)', ...style }}>{elements}</div>;
}

export default MarkdownView;
