// src/components/NotificationBell.jsx
// Bell icon button with unread badge + dropdown notification panel.
// Consumes NotificationContext — must be rendered inside NotificationProvider.

import { useState, useRef, useEffect } from 'react';
import { useNotifications, relativeTime } from '../context/NotificationContext.jsx';

const TYPE_META = {
  ticket_message: { icon: '💬', color: 'var(--accent-primary)', bg: 'rgba(234, 88, 12, 0.10)' },
  doc_edit: { icon: '✏️', color: 'var(--text-primary)', bg: 'rgba(59, 130, 246, 0.12)' },
  doc_upload: { icon: '📤', color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.10)' },
  status_change: { icon: '🔄', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' },
  mention: { icon: '📣', color: '#6366F1', bg: 'var(--accent-soft)' },
  // Server-originated (ITSM expansion)
  sla_approaching: { icon: '⏳', color: '#D97706', bg: 'rgba(245, 158, 11, 0.10)' },
  sla_breached: { icon: '🚨', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  approval_request: { icon: '🖊️', color: '#6366F1', bg: 'var(--accent-soft)' },
  approval_decided: { icon: '✅', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' },
  major_incident: { icon: '📢', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  csat_prompt: { icon: '⭐', color: '#D97706', bg: 'rgba(245, 158, 11, 0.10)' },
};

export default function NotificationBell({ onNavigate }) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleItemClick = n => {
    markRead(n.id);
    setOpen(false);
    if (n.ticketId && onNavigate) onNavigate('mytickets', n.ticketId);
    else if (n.docId && onNavigate) onNavigate('docs', n.docId);
    else if (n.type === 'feedback' && onNavigate) onNavigate('feedback');
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        style={{
          position: 'relative',
          background: open ? 'var(--bg-hover)' : 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '7px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
          lineHeight: 1,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '3px',
              right: '3px',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              background: 'var(--accent-primary)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: "'Inter', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
              border: '2px solid var(--text-primary)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            background: 'var(--bg-elevated)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(26,43,74,0.18), 0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px 12px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    borderRadius: '100px',
                    padding: '2px 7px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--accent-primary)',
                    fontFamily: "'Inter', sans-serif",
                    padding: '3px 6px',
                    borderRadius: '5px',
                  }}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    fontFamily: "'Inter', sans-serif",
                    padding: '3px 6px',
                    borderRadius: '5px',
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔔</div>
                You&apos;re all caught up!
              </div>
            ) : (
              notifications.map(n => {
                const meta = TYPE_META[n.type] || TYPE_META.ticket_message;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '11px',
                      width: '100%',
                      padding: '12px 16px',
                      background: n.read ? 'var(--bg-elevated)' : 'var(--accent-soft)',
                      border: 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: "'Inter', sans-serif",
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-page)')}
                    onMouseLeave={e =>
                      (e.currentTarget.style.background = n.read
                        ? 'var(--bg-surface)'
                        : 'var(--accent-soft)')
                    }
                  >
                    {/* Type icon */}
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: meta.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: n.read ? 600 : 800,
                          color: 'var(--text-primary)',
                          lineHeight: 1.35,
                          marginBottom: '3px',
                        }}
                      >
                        {n.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          marginBottom: '4px',
                        }}
                      >
                        {n.body}
                      </div>
                      <div
                        style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}
                      >
                        {relativeTime(n.createdAt)}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--accent-primary)',
                          flexShrink: 0,
                          marginTop: '4px',
                        }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Showing {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
