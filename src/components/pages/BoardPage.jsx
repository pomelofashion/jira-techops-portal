// src/components/pages/BoardPage.jsx
// The Jira-parity Kanban board: fixed 11-column PESD1 workflow, drag-to-
// transition, Jira-style filter bar, quick create. Presentational — the shell
// (PomeloTechOpsPortal.jsx) owns the ticket store and passes data + actions:
//   tickets, currentUser, canDrag(t), canCreate, assignableUsers,
//   onMoveTicket(id, status), onOpenTicket(t), onQuickCreate(payload),
//   onOpenFullForm()
// Filter state persists via the shared localStorage store (survives reloads).

import { useMemo, useState } from 'react';
import { BOARD_COLUMNS, PRIORITY_COLORS } from '../../lib/constants.js';
import { loadStore, saveStore } from '../../lib/store.js';
import { useBoardDnD } from '../board/useBoardDnD.js';
import { useContainerWidth } from '../board/useContainerWidth.js';
import BoardColumn from '../board/BoardColumn.jsx';
import BoardFilterBar from '../board/BoardFilterBar.jsx';
import QuickCreateModal from '../board/QuickCreateModal.jsx';

const PRIORITY_ORDER = Object.fromEntries(Object.keys(PRIORITY_COLORS).map((p, i) => [p, i]));
const FILTERS_KEY = 'boardFilters';
const DEFAULT_FILTERS = {
  search: '',
  assignees: [],
  type: 'All',
  label: 'All',
  quick: { mine: false, recent: false, overdue: false },
};

export default function BoardPage({
  tickets,
  currentUser,
  canDrag,
  canCreate,
  assignableUsers,
  onMoveTicket,
  onOpenTicket,
  onQuickCreate,
  onOpenFullForm,
  boardKey,
}) {
  // Filters persist per board so each team keeps its own saved view. The host
  // remounts this component (key=board) on board switch, so the lazy useState
  // initializer re-reads the right store entry.
  const filtersKey = boardKey ? `${FILTERS_KEY}:${boardKey}` : FILTERS_KEY;
  const [filters, setFiltersState] = useState(() => ({
    ...DEFAULT_FILTERS,
    ...loadStore(filtersKey, {}),
    quick: { ...DEFAULT_FILTERS.quick, ...(loadStore(filtersKey, {}).quick || {}) },
  }));
  const [showCreate, setShowCreate] = useState(false);

  const setFilters = updater => {
    setFiltersState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveStore(filtersKey, next);
      return next;
    });
  };

  const dnd = useBoardDnD((cardId, columnName) => onMoveTicket(cardId, columnName));

  // Container-aware density: measure the real width the grid gets (the
  // sidebar makes window breakpoints unreliable) and adapt card rendering.
  //   regular  — full cards
  //   compact  — condensed type, short keys, tighter chips
  //   scroll   — below readable width the fit-all-columns rule yields to a
  //              horizontally scrolling grid with a readable minimum
  const [sizeRef, boardWidth] = useContainerWidth();
  const columnWidth = boardWidth
    ? (boardWidth - (BOARD_COLUMNS.length - 1) * 10) / BOARD_COLUMNS.length
    : 999;
  const density = columnWidth >= 170 ? 'regular' : columnWidth >= 95 ? 'compact' : 'scroll';

  const assigneeOptions = useMemo(() => {
    const set = new Set(tickets.map(t => t.assignee).filter(Boolean));
    assignableUsers.forEach(u => set.add(u));
    return [...Array.from(set).sort(), 'Unassigned'];
  }, [tickets, assignableUsers]);

  const labelOptions = useMemo(() => {
    const set = new Set();
    tickets.forEach(t => (t.labels || []).forEach(l => set.add(l)));
    return Array.from(set).sort();
  }, [tickets]);

  const assigneeFilter = useMemo(() => new Set(filters.assignees), [filters.assignees]);

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return tickets.filter(t => {
      if (q) {
        const hay = `${t.title} ${t.id} ${(t.labels || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (assigneeFilter.size > 0) {
        const key = t.assignee || 'Unassigned';
        if (!assigneeFilter.has(key)) return false;
      }
      if (filters.type !== 'All' && (t.issueType || 'Task') !== filters.type) return false;
      if (filters.label !== 'All' && !(t.labels || []).includes(filters.label)) return false;
      if (filters.quick.mine && t.assigneeEmail !== currentUser?.email) return false;
      if (filters.quick.recent && (t.updated || t.created || '') < weekAgo) return false;
      if (filters.quick.overdue && !(t.dueDate && t.dueDate < today)) return false;
      return true;
    });
  }, [tickets, filters, assigneeFilter, currentUser?.email]);

  const byColumn = useMemo(() => {
    const map = Object.fromEntries(BOARD_COLUMNS.map(c => [c.name, []]));
    for (const t of visible) (map[t.status] || (map[t.status] = [])).push(t);
    for (const list of Object.values(map)) {
      list.sort(
        (a, b) =>
          (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
          String(b.created || '').localeCompare(String(a.created || ''))
      );
    }
    return map;
  }, [visible]);

  const hasFilters =
    filters.search !== '' ||
    filters.assignees.length > 0 ||
    filters.type !== 'All' ||
    filters.label !== 'All' ||
    Object.values(filters.quick).some(Boolean);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: 'calc(100vh - 150px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Board
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {visible.length} of {tickets.length} tickets · drag cards to change status
          </div>
        </div>
        <BoardFilterBar
          search={filters.search}
          setSearch={v => setFilters(f => ({ ...f, search: v }))}
          assignees={assigneeOptions}
          assigneeFilter={assigneeFilter}
          toggleAssignee={a =>
            setFilters(f => ({
              ...f,
              assignees: f.assignees.includes(a)
                ? f.assignees.filter(x => x !== a)
                : [...f.assignees, a],
            }))
          }
          typeFilter={filters.type}
          setTypeFilter={v => setFilters(f => ({ ...f, type: v }))}
          labels={labelOptions}
          labelFilter={filters.label}
          setLabelFilter={v => setFilters(f => ({ ...f, label: v }))}
          quick={filters.quick}
          toggleQuick={k => setFilters(f => ({ ...f, quick: { ...f.quick, [k]: !f.quick[k] } }))}
          hasFilters={hasFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
      </div>

      {visible.length === 0 && tickets.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '10px',
            borderRadius: '8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          No tickets match these filters.
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--accent-primary)',
              padding: 0,
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Columns share the viewport width; only below a readable minimum
          does the grid fall back to horizontal scrolling. */}
      <div
        ref={el => {
          dnd.scrollRef.current = el;
          sizeRef.current = el;
        }}
        style={{
          display: 'grid',
          gridTemplateColumns:
            density === 'scroll'
              ? `repeat(${BOARD_COLUMNS.length}, minmax(150px, 1fr))`
              : `repeat(${BOARD_COLUMNS.length}, minmax(0, 1fr))`,
          // Bound the single grid row to the container height — the implicit
          // row is auto-sized otherwise, so a tall column would stretch it and
          // spill cards past the page (columns must scroll internally instead).
          gridTemplateRows: 'minmax(0, 1fr)',
          overflowX: density === 'scroll' ? 'auto' : 'visible',
          gap: '10px',
          flex: 1,
          minHeight: 0,
          paddingBottom: '8px',
        }}
      >
        {BOARD_COLUMNS.map((col, i) => (
          <BoardColumn
            key={col.id}
            column={col}
            tickets={byColumn[col.name] || []}
            isDragTarget={dnd.dragOver === col.name}
            onDragOver={dnd.onColumnDragOver}
            onDrop={dnd.onDrop}
            dnd={dnd}
            canDrag={canDrag}
            compact={density !== 'regular'}
            onOpenTicket={onOpenTicket}
            headerAction={
              i === 0 && canCreate ? (
                <button
                  onClick={() => setShowCreate(true)}
                  title="Create ticket"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 800,
                    color: 'var(--accent-primary)',
                    padding: '0 2px',
                  }}
                >
                  ＋ Create
                </button>
              ) : null
            }
          />
        ))}
      </div>

      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onCreate={onQuickCreate}
          assignableUsers={assignableUsers}
          onOpenFullForm={onOpenFullForm}
        />
      )}
    </div>
  );
}
