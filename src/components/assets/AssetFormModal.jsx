// src/components/assets/AssetFormModal.jsx
// Create/edit modal for an asset. Status changes ride the dedicated
// assign/return actions or the repair/retire select (validated server-side).

import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { S } from '../../lib/styles.js';
import DateField from '../DateField.jsx';

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 18, 30, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  padding: '20px',
};

const lbl = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '5px',
};

export default function AssetFormModal({ initial, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({
    name: initial?.name || '',
    type: initial?.type || 'hardware',
    serial: initial?.serial || '',
    model: initial?.model || '',
    vendor: initial?.vendor || '',
    purchaseDate: initial?.purchaseDate ? String(initial.purchaseDate).slice(0, 10) : '',
    warrantyExpires: initial?.warrantyExpires ? String(initial.warrantyExpires).slice(0, 10) : '',
    cost: initial?.cost ?? '',
    notes: initial?.notes || '',
    status: initial?.status || 'in-stock',
  }));
  const [saving, setSaving] = useState(false);
  const set = patch => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      serial: draft.serial.trim() || null,
      model: draft.model.trim() || null,
      vendor: draft.vendor.trim() || null,
      purchaseDate: draft.purchaseDate || null,
      warrantyExpires: draft.warrantyExpires || null,
      cost: draft.cost === '' ? null : Number(draft.cost),
      notes: draft.notes.trim() || null,
    };
    // Repair/retire transitions only — assignment has dedicated endpoints.
    if (initial && draft.status !== initial.status) payload.status = draft.status;
    await onSave(payload);
    setSaving(false);
  };

  const row = { display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' };
  const col = { flex: '1 1 180px' };

  return (
    <div style={overlay} onClick={onClose}>
      <div
        style={{
          ...S.card,
          width: '560px',
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '22px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {initial ? `Edit ${initial.tag}` : 'New asset'}
          </div>
          <button
            style={{ ...S.ghostBtn, padding: '5px 8px' }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={lbl}>Name *</label>
          <input
            style={S.input}
            value={draft.name}
            onChange={e => set({ name: e.target.value })}
            maxLength={160}
          />
        </div>
        <div style={row}>
          <div style={{ flex: '0 1 150px' }}>
            <label style={lbl}>Type</label>
            <select
              style={S.select}
              value={draft.type}
              onChange={e => set({ type: e.target.value })}
            >
              <option value="hardware">Hardware</option>
              <option value="software">Software</option>
              <option value="license">License</option>
            </select>
          </div>
          {initial && (
            <div style={{ flex: '0 1 170px' }}>
              <label style={lbl}>Status</label>
              <select
                style={S.select}
                value={draft.status}
                onChange={e => set({ status: e.target.value })}
              >
                <option value={initial.status}>{initial.status}</option>
                {initial.status === 'in-stock' && <option value="repair">repair</option>}
                {initial.status === 'in-stock' && <option value="retired">retired</option>}
                {initial.status === 'assigned' && <option value="repair">repair</option>}
                {initial.status === 'repair' && <option value="in-stock">in-stock</option>}
                {initial.status === 'repair' && <option value="retired">retired</option>}
              </select>
            </div>
          )}
          <div style={col}>
            <label style={lbl}>Serial</label>
            <input
              style={S.input}
              value={draft.serial}
              onChange={e => set({ serial: e.target.value })}
              maxLength={120}
            />
          </div>
        </div>
        <div style={row}>
          <div style={col}>
            <label style={lbl}>Model</label>
            <input
              style={S.input}
              value={draft.model}
              onChange={e => set({ model: e.target.value })}
              maxLength={160}
            />
          </div>
          <div style={col}>
            <label style={lbl}>Vendor</label>
            <input
              style={S.input}
              value={draft.vendor}
              onChange={e => set({ vendor: e.target.value })}
              maxLength={160}
            />
          </div>
        </div>
        <div style={row}>
          <div style={col}>
            <label style={lbl}>Purchase date</label>
            <DateField
              value={draft.purchaseDate}
              onChange={e => set({ purchaseDate: e.target.value })}
            />
          </div>
          <div style={col}>
            <label style={lbl}>Warranty expires</label>
            <DateField
              value={draft.warrantyExpires}
              onChange={e => set({ warrantyExpires: e.target.value })}
            />
          </div>
          <div style={{ flex: '0 1 120px' }}>
            <label style={lbl}>Cost (USD)</label>
            <input
              type="number"
              min="0"
              style={S.input}
              value={draft.cost}
              onChange={e => set({ cost: e.target.value })}
            />
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={lbl}>Notes</label>
          <textarea
            style={{ ...S.textarea, minHeight: '70px' }}
            value={draft.notes}
            onChange={e => set({ notes: e.target.value })}
            maxLength={4000}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <div>
            {onDelete && (
              <button
                style={{ ...S.ghostBtn, color: '#DC2626', borderColor: '#FCA5A5' }}
                onClick={onDelete}
              >
                <Trash2 size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={S.ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button style={S.orangeBtn} onClick={save} disabled={saving || !draft.name.trim()}>
              <Save size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              {saving ? 'Saving…' : 'Save asset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
