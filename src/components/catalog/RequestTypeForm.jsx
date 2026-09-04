// src/components/catalog/RequestTypeForm.jsx
// Renders a request type's JSONB field schema as a form and submits it as a
// ticket (createTicket with requestTypeId + formValues). The structured
// answers are also rendered into the description so every existing ticket
// view shows the content without knowing about form_values.

import { useState } from 'react';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { S } from '../../lib/styles.js';
import { createTicket } from '../../api/ticketsApi.js';
import { catalogIcon } from './catalogIcons.js';
import DateField from '../DateField.jsx';

const fieldLabel = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

function renderAnswersAsText(fields, values) {
  const lines = [];
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined || v === '') continue;
    lines.push(`**${f.label}**\n${f.type === 'checkbox' ? (v ? 'Yes' : 'No') : v}`);
  }
  return lines.join('\n\n');
}

export default function RequestTypeForm({ type, currentUser, onBack, onToast, onDone }) {
  const Icon = catalogIcon(type.icon);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of type.fields) init[f.id] = f.type === 'checkbox' ? false : '';
    return init;
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);

  const setValue = (id, v) => setValues(prev => ({ ...prev, [id]: v }));

  const validate = () => {
    const e = {};
    if (!title.trim()) e.__title = 'Required';
    for (const f of type.fields) {
      const v = values[f.id];
      if (f.required && (v === '' || v === false || v === undefined)) e[f.id] = 'Required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    // Drop empty optional answers so the server's required/type checks see
    // only what the requester actually filled in.
    const cleaned = {};
    for (const f of type.fields) {
      const v = values[f.id];
      if (v === '' || v === undefined) continue;
      cleaned[f.id] = v;
    }
    const { data, error } = await createTicket({
      title: title.trim(),
      description: renderAnswersAsText(type.fields, cleaned),
      requestTypeId: type.id,
      formValues: cleaned,
    });
    setSubmitting(false);
    if (error) {
      onToast?.(error, 'error');
      return;
    }
    setCreatedKey(data.key);
    onDone?.(data);
  };

  if (createdKey) {
    return (
      <div style={{ ...S.card, padding: '40px', textAlign: 'center', maxWidth: '560px' }}>
        <CheckCircle2 size={44} color="#16A34A" style={{ marginBottom: '12px' }} />
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Request submitted
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
          {type.name} filed as <strong>{createdKey}</strong>. Track it under My Tickets.
        </div>
        <button style={S.ghostBtn} onClick={onBack}>
          <ArrowLeft size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
          Back to catalog
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <button style={{ ...S.ghostBtn, marginBottom: '16px' }} onClick={onBack}>
        <ArrowLeft size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
        All request types
      </button>

      <div style={{ ...S.card, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <Icon size={22} color="var(--accent-primary)" />
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {type.name}
          </div>
        </div>
        {type.description ? (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            {type.description}
          </div>
        ) : (
          <div style={{ marginBottom: '18px' }} />
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={fieldLabel}>
            Summary <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <input
            style={{ ...S.input, ...(errors.__title ? { borderColor: '#DC2626' } : {}) }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`Short summary of your ${type.name.toLowerCase()}`}
            maxLength={300}
          />
          {errors.__title && (
            <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
              {errors.__title}
            </div>
          )}
        </div>

        {type.fields.map(f => (
          <div key={f.id} style={{ marginBottom: '14px' }}>
            {f.type !== 'checkbox' && (
              <label style={fieldLabel}>
                {f.label} {f.required && <span style={{ color: '#DC2626' }}>*</span>}
              </label>
            )}
            {f.type === 'text' && (
              <input
                style={{ ...S.input, ...(errors[f.id] ? { borderColor: '#DC2626' } : {}) }}
                value={values[f.id]}
                onChange={e => setValue(f.id, e.target.value)}
                placeholder={f.placeholder || ''}
                maxLength={4000}
              />
            )}
            {f.type === 'textarea' && (
              <textarea
                style={{
                  ...S.textarea,
                  minHeight: '90px',
                  ...(errors[f.id] ? { borderColor: '#DC2626' } : {}),
                }}
                value={values[f.id]}
                onChange={e => setValue(f.id, e.target.value)}
                placeholder={f.placeholder || ''}
                maxLength={4000}
              />
            )}
            {f.type === 'select' && (
              <select
                style={{ ...S.select, ...(errors[f.id] ? { borderColor: '#DC2626' } : {}) }}
                value={values[f.id]}
                onChange={e => setValue(f.id, e.target.value)}
              >
                <option value="">Select…</option>
                {f.options.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {f.type === 'date' && (
              <DateField
                style={errors[f.id] ? { borderColor: '#DC2626' } : {}}
                value={values[f.id]}
                onChange={e => setValue(f.id, e.target.value)}
              />
            )}
            {f.type === 'checkbox' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(values[f.id])}
                  onChange={e => setValue(f.id, e.target.checked)}
                />
                {f.label} {f.required && <span style={{ color: '#DC2626' }}>*</span>}
              </label>
            )}
            {errors[f.id] && (
              <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
                {errors[f.id]}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={S.orangeBtn} onClick={submit} disabled={submitting}>
            <Send size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
          Submitting as {currentUser?.name} ({currentUser?.email})
        </div>
      </div>
    </div>
  );
}
