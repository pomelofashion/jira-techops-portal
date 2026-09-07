// src/components/admin/TicketFieldsConfigPage.jsx
// Admin editor for the structured ticket-field layout (system.settings_edit).
// Rename labels, reorder, show/hide, toggle editability, and add/remove fields
// from the fixed whitelist. Saving pushes to /api/config/ticket-fields and the
// host refreshes the in-memory config so open tickets reflect it.

import { useState, useEffect } from 'react';
import { S } from '../../lib/styles.js';
import { TICKET_FIELD_DEFS, TICKET_FIELD_KEYS } from '../../lib/ticketFields.js';
import { getTicketFieldConfig, setTicketFieldConfig } from '../../api/configApi.js';

export default function TicketFieldsConfigPage({ onToast, onSaved }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addKey, setAddKey] = useState('');

  useEffect(() => {
    getTicketFieldConfig().then(({ data, error }) => {
      if (error) onToast?.(error, 'error');
      else setFields((data?.fields || []).filter(f => TICKET_FIELD_DEFS[f.key]));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = TICKET_FIELD_KEYS.filter(k => !fields.some(f => f.key === k));

  const update = (i, patch) =>
    setFields(fs => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    setFields(fs => {
      const next = fs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const remove = i => setFields(fs => fs.filter((_, idx) => idx !== i));
  const add = () => {
    if (!addKey) return;
    setFields(fs => [
      ...fs,
      { key: addKey, label: TICKET_FIELD_DEFS[addKey].defaultLabel, visible: true, editable: true },
    ]);
    setAddKey('');
  };

  const save = async () => {
    if (!fields.length) return onToast?.('Keep at least one field.', 'error');
    if (fields.some(f => !f.label.trim())) return onToast?.('Every field needs a label.', 'error');
    setSaving(true);
    const { error } = await setTicketFieldConfig(fields);
    setSaving(false);
    if (error) return onToast?.(error, 'error');
    onToast?.('Ticket fields saved.');
    onSaved?.(fields);
  };

  const cell = {
    padding: '10px 12px',
    borderTop: '1px solid var(--border-subtle)',
    fontSize: '13px',
  };
  const toggleBtn = on => ({
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: on ? 'var(--accent-soft)' : 'var(--bg-elevated)',
    color: on ? 'var(--accent-primary)' : 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  });

  return (
    <div style={{ maxWidth: '820px' }}>
      <div style={S.pageTitle}>Ticket Fields</div>
      <div style={S.pageSub}>
        Choose which submission fields show on every ticket, their order and labels. Labels are
        fixed on the ticket; the values under them stay editable.
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '16px' }}>
          Loading…
        </div>
      ) : (
        <div style={{ ...S.card, marginTop: '18px', padding: '4px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)' }}>
                <th style={{ ...cell, borderTop: 'none', textAlign: 'left', fontWeight: 700 }}>
                  Order
                </th>
                <th style={{ ...cell, borderTop: 'none', textAlign: 'left', fontWeight: 700 }}>
                  Field
                </th>
                <th style={{ ...cell, borderTop: 'none', textAlign: 'left', fontWeight: 700 }}>
                  Label (shown on ticket)
                </th>
                <th style={{ ...cell, borderTop: 'none', textAlign: 'center', fontWeight: 700 }}>
                  Visible
                </th>
                <th style={{ ...cell, borderTop: 'none', textAlign: 'center', fontWeight: 700 }}>
                  Editable
                </th>
                <th style={{ ...cell, borderTop: 'none' }} />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.key}>
                  <td style={cell}>
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      style={{
                        ...toggleBtn(false),
                        marginRight: '4px',
                        opacity: i === 0 ? 0.4 : 1,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === fields.length - 1}
                      style={{ ...toggleBtn(false), opacity: i === fields.length - 1 ? 0.4 : 1 }}
                    >
                      ↓
                    </button>
                  </td>
                  <td style={{ ...cell, color: 'var(--text-muted)' }}>{f.key}</td>
                  <td style={cell}>
                    <input
                      value={f.label}
                      onChange={e => update(i, { label: e.target.value })}
                      maxLength={60}
                      style={{ ...S.input, fontSize: '13px', padding: '6px 10px' }}
                    />
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <button
                      onClick={() => update(i, { visible: !f.visible })}
                      style={toggleBtn(f.visible)}
                    >
                      {f.visible ? 'Shown' : 'Hidden'}
                    </button>
                  </td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <button
                      onClick={() => update(i, { editable: !f.editable })}
                      style={toggleBtn(f.editable)}
                    >
                      {f.editable ? 'Editable' : 'Locked'}
                    </button>
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <button
                      onClick={() => remove(i)}
                      style={{ ...toggleBtn(false), color: '#DC2626' }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          marginTop: '16px',
          flexWrap: 'wrap',
        }}
      >
        {available.length > 0 && (
          <>
            <select
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              style={{ ...S.select, minWidth: '180px' }}
            >
              <option value="">Add a field…</option>
              {available.map(k => (
                <option key={k} value={k}>
                  {TICKET_FIELD_DEFS[k].defaultLabel}
                </option>
              ))}
            </select>
            <button onClick={add} disabled={!addKey} style={S.ghostBtn}>
              Add
            </button>
          </>
        )}
        <button
          onClick={save}
          disabled={saving || loading}
          style={{ ...S.orangeBtn, marginLeft: 'auto' }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
