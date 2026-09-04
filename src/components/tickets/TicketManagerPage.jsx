// src/components/tickets/TicketManagerPage.jsx
// Admin tool to triage tickets at scale: filter by board / status / priority /
// type / assignee / requester / label / date range, select rows (or all
// filtered), and bulk move-board / assign / set-status through one server
// endpoint. Gated by tickets.reassign_any at the section level.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { S } from '../../lib/styles.js';
import {
  BOARD_STATUS_NAMES,
  PRIORITY_COLORS,
  ISSUE_TYPES,
  statusColorFor,
} from '../../lib/constants.js';
import { listTickets, bulkUpdateTickets } from '../../api/ticketsApi.js';
import { listUsers } from '../../api/usersApi.js';
import * as spacesApi from '../../api/spacesApi.js';
import DateField from '../DateField.jsx';

const PAGE = 200;
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export default function TicketManagerPage({ onToast }) {
  const [boards, setBoards] = useState([]);
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  // Filters
  const [fBoard, setFBoard] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fType, setFType] = useState('');
  const [fAssignee, setFAssignee] = useState('');
  const [fRequester, setFRequester] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  // Bulk action inputs
  const [moveBoard, setMoveBoard] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [setStatusTo, setSetStatusTo] = useState('');

  const toast = (m, t) => onToast?.(m, t);

  useEffect(() => {
    spacesApi.listSpaces({ all: '1' }).then(({ data }) => {
      const all = (data?.spaces || []).flatMap(s =>
        (s.boards || []).filter(b => !b.archived).map(b => ({ ...b, spaceName: s.name }))
      );
      setBoards(all);
    });
    listUsers().then(({ data }) => setUsers(data?.users || []));
  }, []);

  // Server-supported filters: board, status, priority. The rest are applied
  // client-side over the fetched page(s).
  const fetchPage = useCallback(
    async reset => {
      setLoading(true);
      const params = { limit: PAGE, offset: reset ? 0 : offset };
      if (fBoard) params.boardId = fBoard;
      if (fStatus) params.status = fStatus;
      if (fPriority) params.priority = fPriority;
      const { data, error } = await listTickets(params);
      if (error) {
        toast(error, 'error');
        setLoading(false);
        return;
      }
      const rows = data.tickets || data || [];
      setTickets(reset ? rows : prev => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
      setOffset((reset ? 0 : offset) + rows.length);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fBoard, fStatus, fPriority, offset]
  );

  // Re-fetch from scratch whenever a server-side filter changes.
  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fBoard, fStatus, fPriority]);

  const boardName = id => {
    const b = boards.find(x => x.id === id);
    return b ? b.key : '—';
  };

  // Client-side filters over the fetched rows.
  const visible = useMemo(() => {
    return tickets.filter(t => {
      if (fType && t.issueType !== fType) return false;
      if (fAssignee && (t.assigneeEmail || '') !== fAssignee) return false;
      if (fRequester) {
        const hay = `${t.requester?.name || ''} ${t.requester?.email || ''}`.toLowerCase();
        if (!hay.includes(fRequester.toLowerCase())) return false;
      }
      if (fLabel && !(t.labels || []).some(l => l.toLowerCase().includes(fLabel.toLowerCase())))
        return false;
      if (fFrom && new Date(t.created) < new Date(fFrom)) return false;
      if (fTo && new Date(t.created) > new Date(`${fTo}T23:59:59`)) return false;
      return true;
    });
  }, [tickets, fType, fAssignee, fRequester, fLabel, fFrom, fTo]);

  const allSelected = visible.length > 0 && visible.every(t => selected.has(t.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map(t => t.id)));
  const toggle = id =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const runBulk = async (action, successMsg) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    const { data, error } = await bulkUpdateTickets(ids, action);
    setBusy(false);
    if (error) return toast(error, 'error');
    toast(`${successMsg} (${data.updated} ticket${data.updated === 1 ? '' : 's'}).`);
    setSelected(new Set());
    setMoveBoard('');
    setAssignTo('');
    setSetStatusTo('');
    fetchPage(true);
  };

  const clearFilters = () => {
    setFBoard('');
    setFStatus('');
    setFPriority('');
    setFType('');
    setFAssignee('');
    setFRequester('');
    setFLabel('');
    setFFrom('');
    setFTo('');
  };

  const th = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' };
  const td = {
    padding: '7px 10px',
    borderTop: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    maxWidth: '260px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
  const filterSel = { ...S.select, minWidth: '130px' };

  return (
    <div>
      <div style={S.pageTitle}>Ticket Manager</div>
      <div style={S.pageSub}>Filter, move between boards, and bulk-assign tickets.</div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          margin: '16px 0',
        }}
      >
        <select value={fBoard} onChange={e => setFBoard(e.target.value)} style={filterSel}>
          <option value="">All boards</option>
          {boards.map(b => (
            <option key={b.id} value={b.id}>
              {b.spaceName} · {b.key}
            </option>
          ))}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={filterSel}>
          <option value="">All statuses</option>
          {BOARD_STATUS_NAMES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={filterSel}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={filterSel}>
          <option value="">All types</option>
          {ISSUE_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} style={filterSel}>
          <option value="">Any assignee</option>
          {users.map(u => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          value={fRequester}
          onChange={e => setFRequester(e.target.value)}
          placeholder="Requester…"
          style={{ ...S.input, width: '150px' }}
        />
        <input
          value={fLabel}
          onChange={e => setFLabel(e.target.value)}
          placeholder="Label…"
          style={{ ...S.input, width: '120px' }}
        />
        <DateField
          value={fFrom}
          onChange={e => setFFrom(e.target.value)}
          style={{ width: '150px' }}
          aria-label="Created from"
        />
        <span style={{ color: 'var(--text-muted)' }}>→</span>
        <DateField
          value={fTo}
          onChange={e => setFTo(e.target.value)}
          style={{ width: '150px' }}
          aria-label="Created to"
        />
        <button onClick={clearFilters} style={S.ghostBtn}>
          Clear
        </button>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        {loading ? 'Loading…' : `${visible.length} shown`}
        {selected.size > 0 && ` · ${selected.size} selected`}
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid var(--border-default)',
          borderRadius: '10px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-hover)' }}>
              <th style={{ ...th, width: '32px' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th style={th}>Key</th>
              <th style={th}>Title</th>
              <th style={th}>Status</th>
              <th style={th}>Priority</th>
              <th style={th}>Board</th>
              <th style={th}>Assignee</th>
              <th style={th}>Requester</th>
              <th style={th}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(t => (
              <tr
                key={t.id}
                style={{ background: selected.has(t.id) ? 'var(--accent-soft)' : 'transparent' }}
              >
                <td style={{ ...td, borderTop: '1px solid var(--border-subtle)' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label={`Select ${t.key}`}
                  />
                </td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.key}
                  {t.jiraKey && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {' '}
                      · {t.jiraKey}
                    </span>
                  )}
                </td>
                <td style={{ ...td, color: 'var(--text-primary)' }}>{t.title}</td>
                <td style={td}>
                  <span style={{ color: statusColorFor(t.status), fontWeight: 700 }}>
                    {t.status}
                  </span>
                </td>
                <td style={td}>
                  <span
                    style={{ color: PRIORITY_COLORS[t.priority] || 'inherit', fontWeight: 700 }}
                  >
                    {t.priority}
                  </span>
                </td>
                <td style={td}>{boardName(t.boardId)}</td>
                <td style={td}>{t.assigneeEmail || '—'}</td>
                <td style={td}>{t.requester?.name || t.requester?.email || '—'}</td>
                <td style={td}>{t.updated ? new Date(t.updated).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...td, textAlign: 'center', padding: '32px' }}>
                  No tickets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => fetchPage(false)}
          disabled={loading}
          style={{ ...S.ghostBtn, marginTop: '12px' }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 500,
            background: 'var(--bg-branded)',
            color: '#fff',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: '13px' }}>{selected.size} selected</span>

          <select
            value={moveBoard}
            onChange={e => {
              const v = e.target.value;
              setMoveBoard(v);
              if (v) runBulk({ type: 'move', boardId: v }, 'Moved to board');
            }}
            style={{ ...S.select, minWidth: '150px' }}
            disabled={busy}
          >
            <option value="">Move to board…</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>
                {b.spaceName} · {b.key}
              </option>
            ))}
          </select>

          <select
            value={assignTo}
            onChange={e => {
              const v = e.target.value;
              setAssignTo(v);
              if (v)
                runBulk(
                  {
                    type: 'assign',
                    assigneeEmail: v === '__unassign__' ? null : v,
                    assigneeName:
                      v === '__unassign__' ? null : users.find(u => u.email === v)?.name || null,
                  },
                  'Reassigned'
                );
            }}
            style={{ ...S.select, minWidth: '150px' }}
            disabled={busy}
          >
            <option value="">Assign to…</option>
            <option value="__unassign__">Unassign</option>
            {users.map(u => (
              <option key={u.email} value={u.email}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            value={setStatusTo}
            onChange={e => {
              const v = e.target.value;
              setSetStatusTo(v);
              if (v) runBulk({ type: 'status', status: v }, 'Status changed');
            }}
            style={{ ...S.select, minWidth: '150px' }}
            disabled={busy}
          >
            <option value="">Set status…</option>
            {BOARD_STATUS_NAMES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={() => setSelected(new Set())}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
