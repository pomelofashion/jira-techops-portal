// src/components/board/BoardCard.jsx
// One ticket card, mirroring the real PESD1 card anatomy: title, label chips,
// due-date chip (red when overdue), priority glyph, issue-type icon, human
// key, assignee avatar. Presentational — all behavior arrives via props.

import { ChevronsUp, ChevronUp, Equal, ChevronDown, Clock, AlertTriangle } from 'lucide-react';
import {
  PRIORITY_COLORS,
  ISSUE_TYPE_ICONS,
  labelColorFor,
  DONE_STATUSES,
} from '../../lib/constants.js';

const PRIORITY_ICONS = { Critical: ChevronsUp, High: ChevronUp, Medium: Equal, Low: ChevronDown };

const initialsOf = name =>
  String(name)
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function DueChip({ dueDate, status }) {
  if (!dueDate) return null;
  const overdue = !DONE_STATUSES.has(status) && dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: '5px',
        fontSize: '11px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: overdue ? 'rgba(220, 38, 38, 0.10)' : 'var(--bg-hover)',
        color: overdue ? '#B91C1C' : 'var(--text-secondary)',
        border: overdue ? '1px solid #FECACA' : '1px solid transparent',
      }}
    >
      {overdue ? <AlertTriangle size={11} /> : <Clock size={11} />} {dueDate.slice(5)}
    </span>
  );
}

export function LabelChip({ label }) {
  const { bg, fg } = labelColorFor(label);
  return (
    <span
      style={{
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

export default function BoardCard({
  ticket,
  compact,
  dragging,
  draggable,
  onDragStart,
  onDragEnd,
  onOpen,
  boardKey,
}) {
  const PriorityIcon = PRIORITY_ICONS[ticket.priority] || Equal;
  const TypeIcon = ISSUE_TYPE_ICONS[ticket.issueType] || ISSUE_TYPE_ICONS.Task;
  // Narrow columns drop the board-key prefix — on a single-board view the
  // number is the identity; the full key stays one hover away. Legacy keys
  // adopted from before boards existed fall back to stripping TKT-.
  const displayKey = compact
    ? boardKey && ticket.id.startsWith(`${boardKey}-`)
      ? ticket.id.slice(boardKey.length + 1)
      : ticket.id.replace(/^TKT-/, '')
    : ticket.id;
  return (
    <div
      className="pomelo-board-card"
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={e => onDragStart(e, ticket.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(ticket)}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen(ticket)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        padding: compact ? '8px 9px' : '10px 12px',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: dragging ? 0.45 : 1,
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        title={ticket.title}
        style={{
          fontSize: compact ? '12px' : '13px',
          fontWeight: 400,
          color: 'var(--text-primary)',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: compact ? 2 : 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          overflowWrap: 'anywhere',
        }}
      >
        {ticket.title}
      </div>

      {(ticket.labels?.length > 0 || ticket.dueDate) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
          {(ticket.labels || []).map(l => (
            <LabelChip key={l} label={l} />
          ))}
          <DueChip dueDate={ticket.dueDate} status={ticket.status} />
        </div>
      )}

      {/* Key never truncates — on narrow cards the icons/avatar wrap below it. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          flexWrap: 'wrap',
          rowGap: '4px',
        }}
      >
        <span
          title={ticket.id}
          style={{
            fontSize: compact ? '10px' : '11px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayKey}
        </span>
        <PriorityIcon
          size={13}
          strokeWidth={2.5}
          title={`Priority: ${ticket.priority}`}
          style={{ color: PRIORITY_COLORS[ticket.priority] || 'var(--text-muted)', flexShrink: 0 }}
        />
        <TypeIcon
          size={12}
          strokeWidth={2}
          title={ticket.issueType || 'Task'}
          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        />
        <span style={{ marginLeft: 'auto' }}>
          {ticket.assignee ? (
            <span
              title={ticket.assignee}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: compact ? '18px' : '22px',
                height: compact ? '18px' : '22px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 800,
              }}
            >
              {initialsOf(ticket.assignee)}
            </span>
          ) : (
            <span
              title="Unassigned"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: compact ? '18px' : '22px',
                height: compact ? '18px' : '22px',
                borderRadius: '50%',
                background: 'var(--bg-hover)',
                border: '1px dashed var(--border-default)',
                color: 'var(--text-muted)',
                fontSize: '10px',
              }}
            >
              ?
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
