// src/components/spaces/SpacesAdminPage.jsx
// Admin surface for Spaces → Boards → membership (section 'spaces-admin',
// gated by spaces.manage). Spaces group boards per team; each board owns an
// immutable uppercase key that mints its ticket codes (KEY-1, KEY-2…).
// Membership: space members get every board in the space; board members are
// account-level grants on a single board. Archive, never delete.

import { useEffect, useState, useCallback } from 'react';
import { S } from '../../lib/styles.js';
import * as spacesApi from '../../api/spacesApi.js';
import * as usersApi from '../../api/usersApi.js';

const ROLES = ['admin', 'member', 'viewer'];
const suggestKey = name =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

const lbl = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: '4px',
};
const chip = bg => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  background: bg,
  color: 'var(--text-secondary)',
});
const smallBtn = {
  padding: '6px 10px',
  borderRadius: '7px',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
};

// Roster editor shared by space-level and board-level membership.
function MembersPanel({ title, members, users, onSet, onRemove }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');
  const memberIds = new Set(members.map(m => m.userId));
  const candidates = users.filter(u => !memberIds.has(u.id) && u.active !== false);
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '12px',
        background: 'var(--bg-page)',
      }}
    >
      <div style={{ ...lbl, marginBottom: '8px' }}>{title}</div>
      {members.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          No members yet.
        </div>
      )}
      {members.map(m => (
        <div
          key={m.userId}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}
        >
          <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>
            {m.name} <span style={{ color: 'var(--text-muted)' }}>({m.email})</span>
          </span>
          <select value={m.role} onChange={e => onSet(m.userId, e.target.value)} style={S.select}>
            {ROLES.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button style={{ ...smallBtn, color: '#DC2626' }} onClick={() => onRemove(m.userId)}>
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <select
          value={userId}
          onChange={e => setUserId(e.target.value)}
          style={{ ...S.select, flex: 1 }}
        >
          <option value="">Add a user…</option>
          {candidates.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.email}
            </option>
          ))}
        </select>
        <select value={role} onChange={e => setRole(e.target.value)} style={S.select}>
          {ROLES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          style={{ ...S.orangeBtn, padding: '6px 14px', fontSize: '12px' }}
          disabled={!userId}
          onClick={() => {
            if (!userId) return;
            onSet(userId, role);
            setUserId('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function SpacesAdminPage({ onToast, onSpacesChanged }) {
  const [spaces, setSpaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [openSpaceId, setOpenSpaceId] = useState(null);
  const [spaceMembers, setSpaceMembers] = useState({}); // spaceId → members[]
  const [openBoardId, setOpenBoardId] = useState(null);
  const [boardMembers, setBoardMembers] = useState({}); // boardId → members[]
  const [newSpaceName, setNewSpaceName] = useState('');
  const [boardDraft, setBoardDraft] = useState(null); // { spaceId, name, key, jira, keyTouched }

  const toast = useCallback((msg, type) => onToast?.(msg, type), [onToast]);

  const reload = useCallback(async () => {
    const r = await spacesApi.listSpaces({ all: '1' });
    if (r.data?.spaces) setSpaces(r.data.spaces);
    onSpacesChanged?.();
  }, [onSpacesChanged]);

  useEffect(() => {
    reload();
    usersApi.listUsers().then(r => {
      if (r.data?.users) setUsers(r.data.users);
    });
  }, [reload]);

  const loadSpaceMembers = async spaceId => {
    const r = await spacesApi.listSpaceMembers(spaceId);
    if (r.data?.members) setSpaceMembers(m => ({ ...m, [spaceId]: r.data.members }));
  };
  const loadBoardMembers = async (spaceId, boardId) => {
    const r = await spacesApi.listBoardMembers(spaceId, boardId);
    if (r.data?.members) setBoardMembers(m => ({ ...m, [boardId]: r.data.members }));
  };

  const createSpace = async () => {
    if (!newSpaceName.trim()) return;
    const r = await spacesApi.createSpace({ name: newSpaceName.trim() });
    if (r.error) return toast(r.error, 'error');
    setNewSpaceName('');
    toast(`Space “${r.data.name}” created.`);
    reload();
  };

  const createBoard = async () => {
    if (!boardDraft?.name?.trim() || !boardDraft?.key) return;
    const r = await spacesApi.createBoard(boardDraft.spaceId, {
      name: boardDraft.name.trim(),
      key: boardDraft.key,
      ...(boardDraft.jira ? { jiraProjectKey: boardDraft.jira } : {}),
    });
    if (r.error) return toast(r.error, 'error');
    toast(
      `Board ${r.data.key} created — tickets will be numbered ${r.data.key}-1, ${r.data.key}-2…`
    );
    setBoardDraft(null);
    reload();
  };

  const nameById = id => users.find(u => u.id === id)?.name || id;

  return (
    <div>
      <div style={S.pageTitle}>Spaces &amp; Boards</div>
      <div style={S.pageSub}>
        Give every team its own space, boards with their own ticket codes, and exactly the access
        they need — space membership covers all boards; board membership grants a single board.
      </div>

      {/* New space */}
      <div
        style={{
          ...S.card,
          marginBottom: '18px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '0 1 320px' }}>
          <label style={lbl}>New space name</label>
          <input
            style={S.input}
            value={newSpaceName}
            onChange={e => setNewSpaceName(e.target.value)}
            placeholder="e.g. IT Support"
          />
        </div>
        <button style={S.orangeBtn} onClick={createSpace} disabled={!newSpaceName.trim()}>
          + Create Space
        </button>
      </div>

      {spaces.map(space => (
        <div
          key={space.id}
          style={{ ...S.card, marginBottom: '14px', opacity: space.archived ? 0.55 : 1 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}
            >
              {space.name} {space.archived && <span style={chip('var(--bg-hover)')}>archived</span>}
            </div>
            <button
              style={smallBtn}
              onClick={() => {
                const next = openSpaceId === space.id ? null : space.id;
                setOpenSpaceId(next);
                if (next) loadSpaceMembers(space.id);
              }}
            >
              {openSpaceId === space.id ? 'Hide members' : 'Space members'}
            </button>
            <button
              style={smallBtn}
              onClick={() =>
                setBoardDraft(
                  boardDraft?.spaceId === space.id
                    ? null
                    : { spaceId: space.id, name: '', key: '', jira: '', keyTouched: false }
                )
              }
            >
              + Board
            </button>
            <button
              style={{ ...smallBtn, color: space.archived ? 'var(--accent-primary)' : '#DC2626' }}
              onClick={async () => {
                const r = await spacesApi.updateSpace(space.id, { archived: !space.archived });
                if (r.error) return toast(r.error, 'error');
                toast(space.archived ? 'Space restored.' : 'Space archived.');
                reload();
              }}
            >
              {space.archived ? 'Restore' : 'Archive'}
            </button>
          </div>

          {/* Create board form */}
          {boardDraft?.spaceId === space.id && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-end',
                marginTop: '14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Board name</label>
                <input
                  style={S.input}
                  value={boardDraft.name}
                  onChange={e =>
                    setBoardDraft(d => ({
                      ...d,
                      name: e.target.value,
                      key: d.keyTouched ? d.key : suggestKey(e.target.value),
                    }))
                  }
                  placeholder="e.g. IT Support"
                />
              </div>
              <div style={{ flex: '0 1 140px' }}>
                <label style={lbl}>Key (immutable)</label>
                <input
                  style={{ ...S.input, textTransform: 'uppercase' }}
                  value={boardDraft.key}
                  maxLength={10}
                  onChange={e =>
                    setBoardDraft(d => ({
                      ...d,
                      key: suggestKey(e.target.value),
                      keyTouched: true,
                    }))
                  }
                  placeholder="ITS"
                />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label style={lbl}>Jira project (optional)</label>
                <input
                  style={S.input}
                  value={boardDraft.jira}
                  onChange={e => setBoardDraft(d => ({ ...d, jira: e.target.value }))}
                  placeholder="PESD1"
                />
              </div>
              <button
                style={S.orangeBtn}
                disabled={!boardDraft.name.trim() || boardDraft.key.length < 2}
                onClick={createBoard}
              >
                Create board
              </button>
            </div>
          )}

          {/* Space members */}
          {openSpaceId === space.id && (
            <div style={{ marginTop: '14px' }}>
              <MembersPanel
                title={`Members of ${space.name} (all its boards)`}
                members={spaceMembers[space.id] || []}
                users={users}
                onSet={async (userId, role) => {
                  const r = await spacesApi.setSpaceMember(space.id, userId, role);
                  if (r.error) return toast(r.error, 'error');
                  toast(`${nameById(userId)} → ${role} of ${space.name}.`);
                  loadSpaceMembers(space.id);
                  onSpacesChanged?.();
                }}
                onRemove={async userId => {
                  const r = await spacesApi.removeSpaceMember(space.id, userId);
                  if (r.error) return toast(r.error, 'error');
                  toast(`${nameById(userId)} removed from ${space.name}.`);
                  loadSpaceMembers(space.id);
                  onSpacesChanged?.();
                }}
              />
            </div>
          )}

          {/* Boards */}
          <div style={{ marginTop: '12px' }}>
            {(space.boards || []).length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No boards yet.</div>
            )}
            {(space.boards || []).map(b => (
              <div
                key={b.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                  opacity: b.archived ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={chip('var(--accent-soft)')}>{b.key}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {b.name}
                    {b.archived && (
                      <span style={{ ...chip('var(--bg-hover)'), marginLeft: '8px' }}>
                        archived
                      </span>
                    )}
                  </span>
                  {b.jiraProjectKey && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Jira: {b.jiraProjectKey}
                    </span>
                  )}
                  <button
                    style={smallBtn}
                    onClick={() => {
                      const next = openBoardId === b.id ? null : b.id;
                      setOpenBoardId(next);
                      if (next) loadBoardMembers(space.id, b.id);
                    }}
                  >
                    {openBoardId === b.id ? 'Hide members' : 'Board members'}
                  </button>
                  <button
                    style={{ ...smallBtn, color: b.archived ? 'var(--accent-primary)' : '#DC2626' }}
                    onClick={async () => {
                      const r = await spacesApi.updateBoard(space.id, b.id, {
                        archived: !b.archived,
                      });
                      if (r.error) return toast(r.error, 'error');
                      toast(b.archived ? `Board ${b.key} restored.` : `Board ${b.key} archived.`);
                      reload();
                    }}
                  >
                    {b.archived ? 'Restore' : 'Archive'}
                  </button>
                </div>
                {openBoardId === b.id && (
                  <div style={{ marginTop: '10px' }}>
                    <MembersPanel
                      title={`Account-level access to ${b.key} only`}
                      members={boardMembers[b.id] || []}
                      users={users}
                      onSet={async (userId, role) => {
                        const r = await spacesApi.setBoardMember(space.id, b.id, userId, role);
                        if (r.error) return toast(r.error, 'error');
                        toast(`${nameById(userId)} → ${role} of ${b.key}.`);
                        loadBoardMembers(space.id, b.id);
                        onSpacesChanged?.();
                      }}
                      onRemove={async userId => {
                        const r = await spacesApi.removeBoardMember(space.id, b.id, userId);
                        if (r.error) return toast(r.error, 'error');
                        toast(`${nameById(userId)} removed from ${b.key}.`);
                        loadBoardMembers(space.id, b.id);
                        onSpacesChanged?.();
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
