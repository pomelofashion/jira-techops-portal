// src/components/catalog/CatalogAdminPage.jsx
// Admin editor for service-catalog request types (capability: catalog.manage).
// Lists every type including inactive ones; create/edit uses an inline form
// with a field-schema builder. Deleting a type that tickets reference
// deactivates it instead (server behaviour) so history stays intact.

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Save, EyeOff } from 'lucide-react';
import { S } from '../../lib/styles.js';
import {
  listAllRequestTypes,
  createRequestType,
  updateRequestType,
  deleteRequestType,
} from '../../api/requestTypesApi.js';
import { catalogIcon, ICON_NAMES } from './catalogIcons.js';
import { listSpaces } from '../../api/spacesApi.js';

const FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'checkbox'];
const PRIORITIES = ['', 'Critical', 'High', 'Medium', 'Low'];
const ISSUE_TYPES = ['', 'Task', 'Bug', 'Support Request'];

const TH = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-default)',
};
const TD = {
  padding: '10px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-default)',
  verticalAlign: 'top',
};

const emptyDraft = () => ({
  name: '',
  description: '',
  icon: 'ClipboardList',
  category: 'General',
  fields: [],
  defaults: {},
  requiresApproval: false,
  approverEmail: '',
  active: true,
  sort: 0,
});

const slugifyId = label =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'field';

function FieldBuilder({ fields, onChange }) {
  const update = (i, patch) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = i => onChange(fields.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...fields,
      { id: `field_${fields.length + 1}`, label: '', type: 'text', options: [], required: false },
    ]);

  return (
    <div>
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '8px',
            flexWrap: 'wrap',
            padding: '8px',
            border: '1px dashed var(--border-default)',
            borderRadius: '8px',
          }}
        >
          <input
            style={{ ...S.input, width: '220px' }}
            placeholder="Question label"
            value={f.label}
            onChange={e => update(i, { label: e.target.value, id: slugifyId(e.target.value) })}
          />
          <select
            style={{ ...S.select, width: '120px' }}
            value={f.type}
            onChange={e => update(i, { type: e.target.value })}
          >
            {FIELD_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {f.type === 'select' && (
            <input
              style={{ ...S.input, width: '260px' }}
              placeholder="Options, comma-separated"
              value={(f.options || []).join(', ')}
              onChange={e =>
                update(i, {
                  options: e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
            />
          )}
          <label
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <input
              type="checkbox"
              checked={f.required}
              onChange={e => update(i, { required: e.target.checked })}
            />
            required
          </label>
          <button
            style={{ ...S.ghostBtn, padding: '5px 8px' }}
            onClick={() => remove(i)}
            aria-label="Remove field"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button style={{ ...S.ghostBtn, marginTop: '2px' }} onClick={add}>
        <Plus size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
        Add field
      </button>
    </div>
  );
}

function TypeEditor({ initial, onCancel, onSaved, onToast }) {
  const [draft, setDraft] = useState(
    initial
      ? { ...emptyDraft(), ...initial, approverEmail: initial.approverEmail || '' }
      : emptyDraft()
  );
  const [saving, setSaving] = useState(false);
  // Boards for type-level routing (the "Route to board" select).
  const [boards, setBoards] = useState([]);
  useEffect(() => {
    listSpaces().then(r => {
      if (r.data?.spaces) setBoards(r.data.spaces.flatMap(s => s.boards || []));
    });
  }, []);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const setDefault = (k, v) =>
    setDraft(d => {
      const defaults = { ...d.defaults };
      if (v) defaults[k] = v;
      else delete defaults[k];
      return { ...d, defaults };
    });

  const save = async () => {
    if (!draft.name.trim()) return onToast('Name is required.', 'error');
    if (draft.fields.some(f => !f.label.trim()))
      return onToast('Every field needs a label.', 'error');
    if (draft.requiresApproval && !draft.approverEmail.trim())
      return onToast('Approval-gated types need an approver email.', 'error');
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      description: draft.description,
      icon: draft.icon,
      category: draft.category.trim() || 'General',
      fields: draft.fields,
      defaults: draft.defaults,
      requiresApproval: draft.requiresApproval,
      approverEmail: draft.approverEmail.trim() || null,
      active: draft.active,
      sort: Number(draft.sort) || 0,
    };
    const { error } = initial?.id
      ? await updateRequestType(initial.id, payload)
      : await createRequestType(payload);
    setSaving(false);
    if (error) return onToast(error, 'error');
    onToast(initial?.id ? 'Request type updated.' : 'Request type created.');
    onSaved();
  };

  const row = { display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' };
  const col = { flex: '1 1 220px' };
  const lbl = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '5px',
  };

  return (
    <div style={{ ...S.card, padding: '20px', marginBottom: '20px' }}>
      <div
        style={{
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '14px',
        }}
      >
        {initial?.id ? `Edit: ${initial.name}` : 'New request type'}
      </div>
      <div style={row}>
        <div style={col}>
          <label style={lbl}>Name</label>
          <input
            style={S.input}
            value={draft.name}
            onChange={e => set({ name: e.target.value })}
            maxLength={80}
          />
        </div>
        <div style={col}>
          <label style={lbl}>Category</label>
          <input
            style={S.input}
            value={draft.category}
            onChange={e => set({ category: e.target.value })}
            maxLength={60}
          />
        </div>
        <div style={{ flex: '0 1 160px' }}>
          <label style={lbl}>Icon</label>
          <select style={S.select} value={draft.icon} onChange={e => set({ icon: e.target.value })}>
            {ICON_NAMES.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 1 90px' }}>
          <label style={lbl}>Sort</label>
          <input
            style={S.input}
            type="number"
            value={draft.sort}
            onChange={e => set({ sort: e.target.value })}
          />
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Description</label>
        <input
          style={S.input}
          value={draft.description}
          onChange={e => set({ description: e.target.value })}
          maxLength={400}
        />
      </div>
      <div style={row}>
        <div style={{ flex: '0 1 160px' }}>
          <label style={lbl}>Default priority</label>
          <select
            style={S.select}
            value={draft.defaults.priority || ''}
            onChange={e => setDefault('priority', e.target.value)}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>
                {p || '(none)'}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 1 180px' }}>
          <label style={lbl}>Default issue type</label>
          <select
            style={S.select}
            value={draft.defaults.issueType || ''}
            onChange={e => setDefault('issueType', e.target.value)}
          >
            {ISSUE_TYPES.map(t => (
              <option key={t} value={t}>
                {t || '(none)'}
              </option>
            ))}
          </select>
        </div>
        <div style={col}>
          <label style={lbl}>Default ticket category</label>
          <input
            style={S.input}
            value={draft.defaults.category || ''}
            onChange={e => setDefault('category', e.target.value)}
            maxLength={80}
          />
        </div>
        <div style={col}>
          <label style={lbl}>Route to (assignee email)</label>
          <input
            style={S.input}
            value={draft.defaults.assigneeEmail || ''}
            onChange={e => setDefault('assigneeEmail', e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div style={{ flex: '0 1 200px' }}>
          <label style={lbl}>Route to board</label>
          <select
            style={S.select}
            value={draft.defaults.boardId || ''}
            onChange={e => setDefault('boardId', e.target.value)}
          >
            <option value="">(default board)</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>
                {b.key === b.name ? b.key : `${b.key} · ${b.name}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ ...row, alignItems: 'center' }}>
        <label
          style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <input
            type="checkbox"
            checked={draft.active}
            onChange={e => set({ active: e.target.checked })}
          />
          Active (visible in the catalog)
        </label>
        <label
          style={{
            fontSize: '13px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <input
            type="checkbox"
            checked={draft.requiresApproval}
            onChange={e => set({ requiresApproval: e.target.checked })}
          />
          Requires approval
        </label>
        {draft.requiresApproval && (
          <input
            style={{ ...S.input, width: '260px' }}
            placeholder="Approver email"
            value={draft.approverEmail}
            onChange={e => set({ approverEmail: e.target.value })}
          />
        )}
      </div>
      <div
        style={{
          margin: '16px 0 6px',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}
      >
        Form fields
      </div>
      <FieldBuilder fields={draft.fields} onChange={fields => set({ fields })} />
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button style={S.ghostBtn} onClick={onCancel}>
          Cancel
        </button>
        <button style={S.orangeBtn} onClick={save} disabled={saving}>
          <Save size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
          {saving ? 'Saving…' : 'Save request type'}
        </button>
      </div>
    </div>
  );
}

export default function CatalogAdminPage({ onToast }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | type object

  const reload = async () => {
    const { data, error } = await listAllRequestTypes();
    if (error) onToast(error, 'error');
    else setTypes(data.requestTypes || []);
    setLoading(false);
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async t => {
    if (
      !window.confirm(`Delete "${t.name}"? Types already used by tickets are deactivated instead.`)
    )
      return;
    const { data, error } = await deleteRequestType(t.id);
    if (error) return onToast(error, 'error');
    onToast(
      data?.deactivated
        ? 'Type had tickets — deactivated instead of deleted.'
        : 'Request type deleted.'
    );
    reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={S.pageTitle}>Service Catalog</div>
          <div style={S.pageSub}>Define the request types users see on the submit page.</div>
        </div>
        {!editing && (
          <button style={S.orangeBtn} onClick={() => setEditing('new')}>
            <Plus size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            New request type
          </button>
        )}
      </div>

      {editing && (
        <TypeEditor
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onToast={onToast}
        />
      )}

      <div style={{ ...S.card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Type</th>
              <th style={TH}>Category</th>
              <th style={TH}>Fields</th>
              <th style={TH}>Approval</th>
              <th style={TH}>Status</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td style={TD} colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !types.length && (
              <tr>
                <td style={TD} colSpan={6}>
                  No request types yet — create the first one.
                </td>
              </tr>
            )}
            {types.map(t => {
              const Icon = catalogIcon(t.icon);
              return (
                <tr key={t.id}>
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <Icon size={16} color="var(--accent-primary)" />
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {t.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={TD}>{t.category}</td>
                  <td style={TD}>{t.fields.length}</td>
                  <td style={TD}>{t.requiresApproval ? t.approverEmail || 'Yes' : '—'}</td>
                  <td style={TD}>
                    {t.active ? (
                      <span style={S.badge('#16A34A')}>Active</span>
                    ) : (
                      <span style={S.badge('#6B7280')}>
                        <EyeOff size={11} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button
                      style={{ ...S.ghostBtn, padding: '5px 9px', marginRight: '6px' }}
                      onClick={() => setEditing(t)}
                      aria-label={`Edit ${t.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      style={{ ...S.ghostBtn, padding: '5px 9px' }}
                      onClick={() => remove(t)}
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
