// src/components/sla/SlaPolicyEditor.jsx
// Live SLA policy table backed by /api/sla/policies. Read-only for everyone;
// inline editing appears for holders of sla.manage. Rendered by SLAPage in
// backend mode, replacing the static SLA_DATA table.

import { useEffect, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { S } from '../../lib/styles.js';
import { SLA_DATA } from '../../lib/constants.js';
import { listSlaPolicies, updateSlaPolicies } from '../../api/slaApi.js';

const PRIORITY_COLORS = Object.fromEntries(SLA_DATA.map(r => [r.priority, r.color]));

const fmtMinutes = m => {
  if (m % 1440 === 0) return `${m / 1440} day${m / 1440 > 1 ? 's' : ''}`;
  if (m % 60 === 0) return `${m / 60} hour${m / 60 > 1 ? 's' : ''}`;
  return `${m} min`;
};

const TH = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export default function SlaPolicyEditor({ canManage, onToast }) {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await listSlaPolicies();
      if (data) setPolicies(data.policies || []);
      setLoading(false);
    })();
  }, []);

  const startEdit = () => {
    setDraft(policies.map(p => ({ ...p })));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const { data, error } = await updateSlaPolicies(
      draft.map(p => ({
        priority: p.priority,
        responseMinutes: Number(p.responseMinutes),
        resolutionMinutes: Number(p.resolutionMinutes),
      }))
    );
    setSaving(false);
    if (error) return onToast?.(error, 'error');
    setPolicies(data.policies || []);
    setEditing(false);
    onToast?.('SLA targets updated. New tickets pick up the new targets.');
  };

  const setField = (priority, field, value) =>
    setDraft(d => d.map(p => (p.priority === priority ? { ...p, [field]: value } : p)));

  if (loading)
    return (
      <div
        style={{
          ...S.card,
          marginBottom: '24px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        Loading SLA targets…
      </div>
    );

  const rows = editing ? draft : policies;

  return (
    <div style={{ ...S.card, marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {canManage && !editing && (
          <button style={{ ...S.ghostBtn, padding: '6px 10px' }} onClick={startEdit}>
            <Pencil size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
            Edit targets
          </button>
        )}
        {editing && (
          <>
            <button
              style={{ ...S.ghostBtn, padding: '6px 10px' }}
              onClick={() => setEditing(false)}
            >
              <X size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
              Cancel
            </button>
            <button
              style={{ ...S.orangeBtn, padding: '6px 12px' }}
              onClick={save}
              disabled={saving}
            >
              <Save size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-default)' }}>
              <th style={TH}>Priority</th>
              <th style={TH}>Response Time</th>
              <th style={TH}>Resolution Target</th>
              <th style={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.priority}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-surface)',
                }}
              >
                <td style={{ padding: '14px 16px' }}>
                  <span style={S.badge(PRIORITY_COLORS[row.priority] || '#52525B')}>
                    {row.priority}
                  </span>
                </td>
                <td
                  style={{
                    padding: '14px 16px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {editing ? (
                    <span>
                      <input
                        type="number"
                        min="1"
                        style={{ ...S.input, width: '90px', display: 'inline-block' }}
                        value={row.responseMinutes}
                        onChange={e => setField(row.priority, 'responseMinutes', e.target.value)}
                      />{' '}
                      min
                    </span>
                  ) : (
                    fmtMinutes(row.responseMinutes)
                  )}
                </td>
                <td
                  style={{ padding: '14px 16px', fontSize: '14px', color: 'var(--text-secondary)' }}
                >
                  {editing ? (
                    <span>
                      <input
                        type="number"
                        min="1"
                        style={{ ...S.input, width: '90px', display: 'inline-block' }}
                        value={row.resolutionMinutes}
                        onChange={e => setField(row.priority, 'resolutionMinutes', e.target.value)}
                      />{' '}
                      min
                    </span>
                  ) : (
                    fmtMinutes(row.resolutionMinutes)
                  )}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#16A34A',
                      fontWeight: 700,
                      background: 'rgba(22, 163, 74, 0.18)',
                      padding: '3px 10px',
                      borderRadius: '100px',
                    }}
                  >
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px' }}>
        Targets apply to new tickets and reprioritized tickets. The clock pauses while a ticket
        waits on the customer; breaches notify the assignee and watchers.
      </div>
    </div>
  );
}
