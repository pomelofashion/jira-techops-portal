// src/components/approvals/ApprovalPanel.jsx
// Approval status strip for a subject (ticket or change). Shows each
// approval's state; lets the named approver (or an approvals.override holder)
// decide inline. Renders nothing when the subject has no approvals.

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { S } from '../../lib/styles.js';
import { listSubjectApprovals, decideApproval } from '../../api/approvalsApi.js';

const STATE_META = {
  pending: {
    color: '#D97706',
    bg: 'rgba(245, 158, 11, 0.10)',
    Icon: Clock,
    label: 'Approval pending',
  },
  approved: {
    color: '#16A34A',
    bg: 'rgba(22, 163, 74, 0.10)',
    Icon: CheckCircle2,
    label: 'Approved',
  },
  rejected: { color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', Icon: XCircle, label: 'Rejected' },
  cancelled: {
    color: 'var(--text-muted)',
    bg: 'var(--bg-hover)',
    Icon: XCircle,
    label: 'Cancelled',
  },
};

export default function ApprovalPanel({
  subjectType = 'ticket',
  subjectId,
  currentUser,
  canOverride,
  onToast,
  onChanged,
}) {
  const [approvals, setApprovals] = useState([]);
  const [busy, setBusy] = useState(null);

  const reload = useCallback(async () => {
    if (!subjectId) return;
    const { data } = await listSubjectApprovals(subjectType, subjectId);
    if (data) setApprovals(data.approvals || []);
  }, [subjectType, subjectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!approvals.length) return null;

  const decide = async (a, decision) => {
    setBusy(a.id);
    const comment = window.prompt(`Optional comment for the requester (${decision}):`) || '';
    const { error } = await decideApproval(a.id, decision, comment);
    setBusy(null);
    if (error) return onToast?.(error, 'error');
    onToast?.(`${a.ticketKey} ${decision}.`);
    reload();
    onChanged?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0' }}>
      {approvals.map(a => {
        const meta = STATE_META[a.status] || STATE_META.pending;
        const mine = currentUser?.email === a.approverEmail;
        const canDecide = a.status === 'pending' && (mine || canOverride);
        return (
          <div
            key={a.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: meta.bg,
              border: `1px solid ${meta.color}33`,
              flexWrap: 'wrap',
            }}
          >
            <meta.Icon size={15} color={meta.color} />
            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                flex: 1,
                minWidth: '160px',
              }}
            >
              <b style={{ color: meta.color }}>{meta.label}</b> — approver {a.approverEmail}
              {a.comment ? (
                <span style={{ color: 'var(--text-secondary)' }}> · “{a.comment}”</span>
              ) : null}
            </div>
            {canDecide && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  style={{ ...S.ghostBtn, padding: '4px 10px', fontSize: '12px', color: '#DC2626' }}
                  disabled={busy === a.id}
                  onClick={() => decide(a, 'rejected')}
                >
                  Reject
                </button>
                <button
                  style={{ ...S.orangeBtn, padding: '4px 10px', fontSize: '12px' }}
                  disabled={busy === a.id}
                  onClick={() => decide(a, 'approved')}
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
