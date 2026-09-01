// src/components/incidents/IncidentsPage.jsx
// Incident command view: every Incident-type ticket with severity + major
// filters, an active-major banner, and per-incident tools — severity picker,
// major-incident toggle, public status updates, and postmortem creation.
// Mutations gate on incidents.manage.

import { useEffect, useState, useCallback } from 'react';
import { Siren, Megaphone, FileText, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { S } from '../../lib/styles.js';
import { SEVERITIES, SEVERITY_COLORS, STATUS_COLORS, DONE_STATUSES } from '../../lib/constants.js';
import {
  listIncidents,
  listIncidentUpdates,
  postIncidentUpdate,
  setIncidentFields,
  createPostmortem,
} from '../../api/incidentsApi.js';

function IncidentRow({ incident, canManage, onToast, onChanged, onOpenDoc }) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const loadUpdates = useCallback(async () => {
    const { data } = await listIncidentUpdates(incident.id);
    if (data) setUpdates(data.updates || []);
  }, [incident.id]);

  useEffect(() => {
    if (open && updates === null) loadUpdates();
  }, [open, updates, loadUpdates]);

  const patch = async fields => {
    setBusy(true);
    const { error } = await setIncidentFields(incident.id, fields);
    setBusy(false);
    if (error) return onToast(error, 'error');
    onChanged();
  };

  const postUpdate = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const { error } = await postIncidentUpdate(incident.id, draft.trim());
    setBusy(false);
    if (error) return onToast(error, 'error');
    setDraft('');
    loadUpdates();
  };

  const makePostmortem = async () => {
    setBusy(true);
    const { data, error } = await createPostmortem(incident.id);
    setBusy(false);
    if (error) return onToast(error, 'error');
    onToast(`Postmortem created: ${data.title}`);
    onChanged();
  };

  const sevColor = SEVERITY_COLORS[incident.severity] || '#6B7280';
  const resolved = DONE_STATUSES.has(incident.status);

  return (
    <div
      style={{
        ...S.card,
        padding: 0,
        overflow: 'hidden',
        borderLeft: incident.majorIncident ? '4px solid #DC2626' : undefined,
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Siren size={17} color={incident.majorIncident ? '#DC2626' : 'var(--text-muted)'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {incident.key}
            {incident.majorIncident && (
              <span style={{ ...S.badge('#DC2626'), marginLeft: '8px' }}>MAJOR</span>
            )}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {incident.title}
          </div>
        </div>
        {incident.severity && <span style={S.badge(sevColor)}>{incident.severity}</span>}
        <span style={S.badge(STATUS_COLORS[incident.status] || '#6B7280')}>{incident.status}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          {canManage && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                flexWrap: 'wrap',
                margin: '12px 0',
              }}
            >
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Severity
              </label>
              <select
                style={{ ...S.select, width: '110px' }}
                value={incident.severity || ''}
                disabled={busy}
                onChange={e => patch({ severity: e.target.value || null })}
              >
                <option value="">—</option>
                {SEVERITIES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                style={{
                  ...S.ghostBtn,
                  padding: '6px 10px',
                  fontSize: '12px',
                  color: incident.majorIncident ? 'var(--text-secondary)' : '#DC2626',
                  borderColor: incident.majorIncident ? 'var(--border-default)' : '#FCA5A5',
                }}
                disabled={busy}
                onClick={() => patch({ majorIncident: !incident.majorIncident })}
              >
                <Megaphone size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                {incident.majorIncident ? 'Stand down major incident' : 'Declare major incident'}
              </button>
              {resolved && !incident.postmortemDocId && (
                <button
                  style={{ ...S.ghostBtn, padding: '6px 10px', fontSize: '12px' }}
                  disabled={busy}
                  onClick={makePostmortem}
                >
                  <FileText size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                  Create postmortem
                </button>
              )}
              {incident.postmortemDocId && (
                <button
                  style={{
                    ...S.ghostBtn,
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#16A34A',
                    borderColor: '#86EFAC',
                  }}
                  onClick={() => onOpenDoc(incident.postmortemDocId)}
                >
                  <FileText size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                  Open postmortem
                </button>
              )}
            </div>
          )}

          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              margin: '10px 0 8px',
            }}
          >
            Status updates
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                style={{ ...S.input, flex: 1 }}
                placeholder="Post a public status update…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && postUpdate()}
                maxLength={8000}
              />
              <button style={S.orangeBtn} disabled={busy || !draft.trim()} onClick={postUpdate}>
                <Send size={13} />
              </button>
            </div>
          )}
          {updates === null && (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Loading…</div>
          )}
          {updates?.length === 0 && (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              No updates posted yet.
            </div>
          )}
          {updates?.map(u => (
            <div
              key={u.id}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{u.body}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {u.author} · {new Date(u.createdAt).toLocaleString()}
                {u.statusAtPost ? ` · status: ${u.statusAtPost}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IncidentsPage({ canManage, onToast, onOpenDoc }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [majorOnly, setMajorOnly] = useState(false);

  const reload = useCallback(async () => {
    const params = { limit: 100 };
    if (severityFilter) params.severity = severityFilter;
    if (majorOnly) params.major = '1';
    const { data, error } = await listIncidents(params);
    if (error) onToast(error, 'error');
    else setIncidents(data.tickets || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severityFilter, majorOnly]);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeMajors = incidents.filter(i => i.majorIncident && !DONE_STATUSES.has(i.status));

  return (
    <div>
      <div style={S.pageTitle}>Incidents</div>
      <div style={S.pageSub}>Unplanned interruptions — severity, comms, and postmortems.</div>

      {activeMajors.length > 0 && (
        <div
          style={{
            background: 'rgba(220, 38, 38, 0.10)',
            border: '1px solid #FCA5A5',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Megaphone size={16} color="#DC2626" />
          <div style={{ fontSize: '13px', color: '#B91C1C', fontWeight: 700 }}>
            {activeMajors.length} active major incident{activeMajors.length > 1 ? 's' : ''}:{' '}
            {activeMajors.map(i => i.key).join(', ')}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select
          style={{ ...S.select, width: '140px' }}
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
        >
          <option value="">All severities</option>
          {SEVERITIES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}
        >
          <input
            type="checkbox"
            checked={majorOnly}
            onChange={e => setMajorOnly(e.target.checked)}
          />
          Major incidents only
        </label>
      </div>

      {loading && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading…</div>}
      {!loading && !incidents.length && (
        <div
          style={{
            ...S.card,
            padding: '32px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          No incidents match. Incidents are tickets with issue type “Incident”.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {incidents.map(i => (
          <IncidentRow
            key={i.id}
            incident={i}
            canManage={canManage}
            onToast={onToast}
            onChanged={reload}
            onOpenDoc={onOpenDoc}
          />
        ))}
      </div>
    </div>
  );
}
