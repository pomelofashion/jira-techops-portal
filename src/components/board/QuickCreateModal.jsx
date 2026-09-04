// src/components/board/QuickCreateModal.jsx
// Lightweight ticket creation from the board's "+ Create" — title, type,
// priority, labels, assignee, due date. The full submit form stays the path
// for rich tickets (attachments, Jira creation); a link hands off to it.

import { useEffect, useState } from 'react';
import { ISSUE_TYPES, PRIORITY_COLORS } from '../../lib/constants.js';
import { S } from '../../lib/styles.js';
import { LabelChip } from './BoardCard.jsx';
import DateField from '../DateField.jsx';

export default function QuickCreateModal({ onClose, onCreate, assignableUsers, onOpenFullForm }) {
  const [title, setTitle] = useState('');
  const [issueType, setIssueType] = useState('Task');
  const [priority, setPriority] = useState('Medium');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addLabel = () => {
    const l = labelInput.trim().toUpperCase();
    if (l && !labels.includes(l)) setLabels(prev => [...prev, l]);
    setLabelInput('');
  };

  const submit = e => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    onCreate({
      title: title.trim(),
      issueType,
      priority,
      assignee: assignee || null,
      dueDate: dueDate || null,
      labels,
    });
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 500 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create ticket"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          zIndex: 501,
          width: '480px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-default)' }}>
          <h2
            style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Create ticket
          </h2>
        </div>
        <form
          onSubmit={submit}
          style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <div>
            <label style={S.label}>Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={S.input}
              autoFocus
              aria-label="Ticket title"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={S.label}>Type</label>
              <select
                value={issueType}
                onChange={e => setIssueType(e.target.value)}
                style={S.select}
              >
                {ISSUE_TYPES.filter(t => t !== 'Sub-task').map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={S.select}>
                {Object.keys(PRIORITY_COLORS).map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Assignee</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)} style={S.select}>
                <option value="">Unassigned</option>
                {assignableUsers.map(u => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Due date</label>
              <DateField
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                aria-label="Due date"
              />
            </div>
          </div>

          <div>
            <label style={S.label}>Labels</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLabel();
                  }
                }}
                placeholder="Type and press Enter"
                style={{ ...S.input, flex: 1 }}
                aria-label="Add label"
              />
            </div>
            {labels.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                {labels.map(l => (
                  <span
                    key={l}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    <LabelChip label={l} />
                    <button
                      type="button"
                      onClick={() => setLabels(prev => prev.filter(x => x !== l))}
                      aria-label={`Remove label ${l}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: '9px 12px',
                background: 'rgba(220, 38, 38, 0.10)',
                color: '#B91C1C',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '4px',
            }}
          >
            <button
              type="button"
              onClick={onOpenFullForm}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                padding: 0,
              }}
            >
              Open full form →
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={onClose} style={S.ghostBtn}>
                Cancel
              </button>
              <button type="submit" style={S.orangeBtn}>
                Create
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
