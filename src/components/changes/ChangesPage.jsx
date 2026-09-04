// src/components/changes/ChangesPage.jsx
// Change management: CHG requests with type/risk/plans/window, approval
// workflow (via the approvals primitive), a CSS-grid month calendar, and
// completion outcomes. Mutations gate on changes.manage.

import { useEffect, useState, useCallback } from 'react';
import { Plus, ArrowLeft, Save, Send, CheckCircle2, CalendarDays, List } from 'lucide-react';
import { S } from '../../lib/styles.js';
import {
  listChanges,
  getChange,
  createChange,
  updateChange,
  submitChangeForApproval,
  completeChange,
} from '../../api/changesApi.js';
import ChangeCalendar from './ChangeCalendar.jsx';
import DateField from '../DateField.jsx';

export const CHANGE_TYPE_META = {
  standard: { label: 'Standard', color: '#16A34A', hint: 'Pre-approved, low-risk, routine' },
  normal: { label: 'Normal', color: '#6366F1', hint: 'Needs CAB approval' },
  emergency: { label: 'Emergency', color: '#DC2626', hint: 'Break-glass; retroactive approval' },
};
export const RISK_COLORS = { low: '#16A34A', medium: '#D97706', high: '#DC2626' };
export const APPROVAL_STATE_META = {
  draft: { label: 'Draft', color: 'var(--text-muted)' },
  pending: { label: 'Approval pending', color: '#D97706' },
  approved: { label: 'Approved', color: '#16A34A' },
  rejected: { label: 'Rejected', color: '#DC2626' },
};
const OUTCOME_META = {
  successful: { label: 'Successful', color: '#16A34A' },
  'rolled-back': { label: 'Rolled back', color: '#D97706' },
  failed: { label: 'Failed', color: '#DC2626' },
};

const lbl = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  margin: '12px 0 5px',
};

// datetime-local <input> ↔ ISO round-trip helpers.
const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = local => (local ? new Date(local).toISOString() : null);

function ChangeDetail({ id, canManage, onBack, onToast }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: d, error } = await getChange(id);
    if (error) return onToast(error, 'error');
    setData(d);
    setDraft({
      changeType: d.changeType,
      risk: d.risk,
      rolloutPlan: d.rolloutPlan || '',
      rollbackPlan: d.rollbackPlan || '',
      testPlan: d.testPlan || '',
      windowStart: toLocalInput(d.windowStart),
      windowEnd: toLocalInput(d.windowEnd),
      status: d.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || !draft)
    return <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading…</div>;

  const save = async () => {
    setBusy(true);
    const { error } = await updateChange(id, {
      changeType: draft.changeType,
      risk: draft.risk,
      rolloutPlan: draft.rolloutPlan || null,
      rollbackPlan: draft.rollbackPlan || null,
      testPlan: draft.testPlan || null,
      windowStart: toIso(draft.windowStart),
      windowEnd: toIso(draft.windowEnd),
      ...(draft.status !== data.status ? { status: draft.status } : {}),
    });
    setBusy(false);
    if (error) return onToast(error, 'error');
    onToast(`${data.key} saved.`);
    load();
  };

  const submit = async () => {
    const emails = window.prompt('Approver emails (comma-separated, must hold changes.approve):');
    if (!emails) return;
    setBusy(true);
    const { error } = await submitChangeForApproval(
      id,
      emails
        .split(',')
        .map(e => e.trim())
        .filter(Boolean)
    );
    setBusy(false);
    if (error) return onToast(error, 'error');
    onToast(`${data.key} submitted for approval.`);
    load();
  };

  const complete = async outcome => {
    setBusy(true);
    const { error } = await completeChange(id, outcome);
    setBusy(false);
    if (error) return onToast(error, 'error');
    onToast(`${data.key} completed: ${outcome}.`);
    load();
  };

  const typeMeta = CHANGE_TYPE_META[data.changeType];
  const apprMeta = APPROVAL_STATE_META[data.approvalState];

  return (
    <div style={{ maxWidth: '800px' }}>
      <button style={{ ...S.ghostBtn, marginBottom: '14px' }} onClick={onBack}>
        <ArrowLeft size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
        All changes
      </button>

      <div style={{ ...S.card, padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)' }}>
              {data.key}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-primary)',
                marginTop: '2px',
              }}
            >
              {data.title}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <span style={S.badge(typeMeta.color)}>{typeMeta.label}</span>
            <span style={S.badge(RISK_COLORS[data.risk])}>risk: {data.risk}</span>
            <span style={S.badge(apprMeta.color)}>{apprMeta.label}</span>
            {data.outcome && (
              <span style={S.badge(OUTCOME_META[data.outcome].color)}>
                {OUTCOME_META[data.outcome].label}
              </span>
            )}
          </div>
        </div>

        {data.description && (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginTop: '10px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {data.description}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
          <div style={{ flex: '0 1 170px' }}>
            <label style={lbl}>Type</label>
            <select
              style={S.select}
              value={draft.changeType}
              disabled={!canManage}
              onChange={e => setDraft(d => ({ ...d, changeType: e.target.value }))}
            >
              {Object.entries(CHANGE_TYPE_META).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 1 140px' }}>
            <label style={lbl}>Risk</label>
            <select
              style={S.select}
              value={draft.risk}
              disabled={!canManage}
              onChange={e => setDraft(d => ({ ...d, risk: e.target.value }))}
            >
              {Object.keys(RISK_COLORS).map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label style={lbl}>Status</label>
            <select
              style={S.select}
              value={draft.status}
              disabled={!canManage}
              onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
            >
              {['To Do', 'In Progress', 'Live'].map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Window start</label>
            <DateField
              type="datetime-local"
              value={draft.windowStart}
              disabled={!canManage}
              onChange={e => setDraft(d => ({ ...d, windowStart: e.target.value }))}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Window end</label>
            <DateField
              type="datetime-local"
              value={draft.windowEnd}
              disabled={!canManage}
              onChange={e => setDraft(d => ({ ...d, windowEnd: e.target.value }))}
            />
          </div>
        </div>

        <label style={lbl}>Rollout plan</label>
        <textarea
          style={{ ...S.textarea, minHeight: '70px' }}
          value={draft.rolloutPlan}
          disabled={!canManage}
          onChange={e => setDraft(d => ({ ...d, rolloutPlan: e.target.value }))}
        />
        <label style={lbl}>Rollback plan</label>
        <textarea
          style={{ ...S.textarea, minHeight: '70px' }}
          value={draft.rollbackPlan}
          disabled={!canManage}
          onChange={e => setDraft(d => ({ ...d, rollbackPlan: e.target.value }))}
        />
        <label style={lbl}>Test plan</label>
        <textarea
          style={{ ...S.textarea, minHeight: '70px' }}
          value={draft.testPlan}
          disabled={!canManage}
          onChange={e => setDraft(d => ({ ...d, testPlan: e.target.value }))}
        />

        {canManage && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              marginTop: '16px',
              flexWrap: 'wrap',
            }}
          >
            {data.approvalState === 'draft' && data.changeType !== 'standard' && (
              <button style={S.ghostBtn} disabled={busy} onClick={submit}>
                <Send size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                Submit for approval
              </button>
            )}
            {!data.outcome && ['approved'].includes(data.approvalState) && (
              <>
                <button
                  style={{ ...S.ghostBtn, color: '#16A34A', borderColor: '#86EFAC' }}
                  disabled={busy}
                  onClick={() => complete('successful')}
                >
                  <CheckCircle2 size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
                  Complete: successful
                </button>
                <button
                  style={{ ...S.ghostBtn, color: '#D97706', borderColor: '#FCD34D' }}
                  disabled={busy}
                  onClick={() => complete('rolled-back')}
                >
                  Rolled back
                </button>
                <button
                  style={{ ...S.ghostBtn, color: '#DC2626', borderColor: '#FCA5A5' }}
                  disabled={busy}
                  onClick={() => complete('failed')}
                >
                  Failed
                </button>
              </>
            )}
            <button style={S.orangeBtn} disabled={busy} onClick={save}>
              <Save size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              Save
            </button>
          </div>
        )}
      </div>

      {(data.approvals || []).length > 0 && (
        <div style={{ ...S.card, marginTop: '14px', padding: '18px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Approvals
          </div>
          {data.approvals.map(a => {
            const m =
              APPROVAL_STATE_META[a.status === 'pending' ? 'pending' : a.status] ||
              APPROVAL_STATE_META.draft;
            return (
              <div
                key={a.id}
                style={{
                  fontSize: '12.5px',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span style={S.badge(m.color)}>{a.status}</span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{a.approverEmail}</span>
                {a.comment && <span style={{ color: 'var(--text-muted)' }}> · “{a.comment}”</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChangesPage({ canManage, onToast }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | calendar
  const [openId, setOpenId] = useState(null);

  const reload = useCallback(async () => {
    const { data, error } = await listChanges();
    if (error) onToast(error, 'error');
    else setChanges(data.changes || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const newChange = async () => {
    const title = window.prompt('Change title:');
    if (!title?.trim()) return;
    const { data, error } = await createChange({ title: title.trim() });
    if (error) return onToast(error, 'error');
    onToast(`${data.key} created.`);
    setOpenId(data.id);
  };

  if (openId) {
    return (
      <ChangeDetail
        id={openId}
        canManage={canManage}
        onBack={() => {
          setOpenId(null);
          reload();
        }}
        onToast={onToast}
      />
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <div style={S.pageTitle}>Changes</div>
          <div style={S.pageSub}>
            Planned modifications — typed, risk-assessed, approved, scheduled.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              ...S.ghostBtn,
              ...(view === 'list'
                ? { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }
                : {}),
            }}
            onClick={() => setView('list')}
          >
            <List size={14} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
            List
          </button>
          <button
            style={{
              ...S.ghostBtn,
              ...(view === 'calendar'
                ? { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }
                : {}),
            }}
            onClick={() => setView('calendar')}
          >
            <CalendarDays size={14} style={{ marginRight: '5px', verticalAlign: '-2px' }} />
            Calendar
          </button>
          {canManage && (
            <button style={S.orangeBtn} onClick={newChange}>
              <Plus size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              New change
            </button>
          )}
        </div>
      </div>

      {view === 'calendar' ? (
        <ChangeCalendar onOpen={setOpenId} onToast={onToast} />
      ) : (
        <>
          {loading && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading…</div>
          )}
          {!loading && !changes.length && (
            <div
              style={{
                ...S.card,
                padding: '32px',
                textAlign: 'center',
                fontSize: '13px',
                color: 'var(--text-secondary)',
              }}
            >
              No change requests yet.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {changes.map(c => {
              const typeMeta = CHANGE_TYPE_META[c.changeType];
              const apprMeta = APPROVAL_STATE_META[c.approvalState];
              return (
                <button
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  style={{
                    ...S.card,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)' }}
                    >
                      {c.key}
                    </div>
                    <div
                      style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}
                    >
                      {c.title}
                    </div>
                    {c.windowStart && (
                      <div
                        style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}
                      >
                        Window: {new Date(c.windowStart).toLocaleString()}
                        {c.windowEnd ? ` → ${new Date(c.windowEnd).toLocaleString()}` : ''}
                      </div>
                    )}
                  </div>
                  <span style={S.badge(typeMeta.color)}>{typeMeta.label}</span>
                  <span style={S.badge(RISK_COLORS[c.risk])}>{c.risk}</span>
                  <span style={S.badge(apprMeta.color)}>{apprMeta.label}</span>
                  {c.outcome && (
                    <span style={S.badge(OUTCOME_META[c.outcome].color)}>
                      {OUTCOME_META[c.outcome].label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
