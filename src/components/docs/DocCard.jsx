// src/components/docs/DocCard.jsx
// Upgraded document card with export, download, format badge, bookmarks, version, timestamps.

import { useState } from 'react';
import DocExporter from './DocExporter.jsx';
import { FORMAT_COLORS } from '../../mocks/docsMockData.js';

const relativeTime = iso => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return 'Updated today';
  if (diff === 1) return 'Updated yesterday';
  if (diff < 30) return `Updated ${diff} days ago`;
  if (diff < 365) return `Updated ${Math.floor(diff / 30)} mo ago`;
  return `Updated ${Math.floor(diff / 365)}y ago`;
};

const fmtFileSize = bytes => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export default function DocCard({
  doc,
  role,
  isBookmarked,
  onToggleBookmark,
  onOpen,
  onFullPage,
  onEdit,
  selectionMode,
  isSelected,
  onToggleSelect,
  searchQuery,
  matchedContent,
  onTogglePin,
  onFlagReview,
  onClearReview,
  onRestore,
}) {
  const [hovering, setHovering] = useState(false);
  const [showExporter, setShowExporter] = useState(false);
  const isAdmin = role === 'superadmin';
  const isArchived = doc.status === 'Archived';

  const fmt = FORMAT_COLORS[doc.format] || FORMAT_COLORS.TXT;
  const catColor = 'var(--text-secondary)';
  // Use the dedicated imageUrl field set during upload (blob URL — fast and reliable)
  const thumbnailSrc = doc.imageUrl || null;

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(doc.id);
    } else {
      onOpen?.(doc);
    }
  };

  const highlight = text => {
    if (!searchQuery || !text) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark
          style={{
            background: 'rgba(250, 204, 21, 0.35)',
            color: 'var(--text-primary)',
            borderRadius: '2px',
            padding: '0 1px',
          }}
        >
          {text.slice(idx, idx + searchQuery.length)}
        </mark>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  };

  return (
    <div
      role="article"
      aria-label={doc.title}
      style={{
        background: isSelected ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: isSelected
          ? '1.5px solid var(--text-primary)'
          : `1px solid ${hovering && !selectionMode ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: '10px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: isSelected
          ? '0 0 0 3px rgba(26,43,74,0.08)'
          : hovering && !selectionMode
            ? '0 4px 18px rgba(124,58,237,0.10)'
            : '0 1px 4px rgba(0,0,0,0.04)',
        position: 'relative',
        fontFamily: "'Inter', sans-serif",
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
    >
      {/* Checkbox overlay — visible in selection mode or when selected */}
      {(selectionMode || isSelected) && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            width: '20px',
            height: '20px',
            borderRadius: '5px',
            border: `2px solid ${isSelected ? 'var(--text-primary)' : 'var(--text-muted)'}`,
            background: isSelected ? 'var(--text-primary)' : 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            flexShrink: 0,
            transition: 'all 0.12s',
          }}
        >
          {isSelected && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path
                d="M1 5L4.5 8.5L11 1"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      )}

      {/* Top row: icon + title + format badge + bookmark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          paddingLeft: selectionMode || isSelected ? '24px' : '0',
          transition: 'padding 0.12s',
        }}
      >
        <span style={{ fontSize: '26px', lineHeight: 1, flexShrink: 0 }}>{doc.icon || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              marginBottom: '4px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}
            >
              {highlight(doc.title)}
            </span>
            {/* Format badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '4px',
                background: fmt.bg,
                color: fmt.color,
                border: `1px solid ${fmt.border}`,
                flexShrink: 0,
              }}
            >
              {doc.format || 'DOC'}
            </span>
            {/* Found in content badge */}
            {matchedContent && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'rgba(250, 204, 21, 0.18)',
                  color: '#854D0E',
                  border: '1px solid #FDE047',
                }}
              >
                Found in content
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '100px',
              background: 'var(--bg-hover)',
              color: catColor,
            }}
          >
            {doc.category}
          </span>
        </div>

        {/* Bookmark toggle — hidden in selection mode */}
        {!selectionMode && (
          <button
            onClick={e => {
              e.stopPropagation();
              onToggleBookmark?.(doc.id);
            }}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '2px',
              flexShrink: 0,
              lineHeight: 1,
              opacity: isBookmarked ? 1 : hovering ? 0.5 : 0.25,
              transition: 'opacity 0.15s',
            }}
          >
            {isBookmarked ? '★' : '☆'}
          </button>
        )}
      </div>

      {/* Image thumbnail — shown instead of description for image docs */}
      {thumbnailSrc ? (
        <div
          style={{
            borderRadius: '6px',
            overflow: 'hidden',
            height: '140px',
            background: 'var(--bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <img
            src={thumbnailSrc}
            alt={doc.title}
            style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Shown only when the image fails to load */}
          <div
            style={{
              display: 'none',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              position: 'absolute',
              inset: 0,
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '24px' }}>🖼️</span>
            Image unavailable
          </div>
        </div>
      ) : (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {highlight(doc.description || doc.summary)}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {doc.version && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid #BFDBFE',
              borderRadius: '4px',
              padding: '2px 6px',
            }}
          >
            v{doc.version}
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {relativeTime(doc.updatedAt)}
        </span>
        {doc.viewCount > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            👁 {doc.viewCount.toLocaleString()}
          </span>
        )}
        {doc.fileSize > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {fmtFileSize(doc.fileSize)}
          </span>
        )}
        {doc.content && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            📖 {Math.max(1, Math.ceil(doc.content.split(/\s+/).filter(Boolean).length / 200))} min
          </span>
        )}
        {role === 'superadmin' && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '100px',
              background:
                doc.visibility === 'IT Team Only'
                  ? 'rgba(220, 38, 38, 0.10)'
                  : 'rgba(22, 163, 74, 0.10)',
              color: doc.visibility === 'IT Team Only' ? '#DC2626' : '#16A34A',
              border: `1px solid ${doc.visibility === 'IT Team Only' ? '#FCA5A5' : '#BBF7D0'}`,
            }}
            title={doc.visibility}
          >
            {doc.visibility === 'IT Team Only' ? '🔒' : '🌐'}
          </span>
        )}
      </div>

      {/* Action row — hidden in selection mode */}
      {!selectionMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: 'auto',
            paddingTop: '4px',
            borderTop: '1px solid var(--border-subtle)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onFullPage?.(doc)}
            aria-label={`Read ${doc.title}`}
            style={{
              flex: 1,
              padding: '7px 0',
              background: 'none',
              border: 'none',
              color: 'var(--accent-primary)',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Read article →
          </button>

          {/* Export */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => {
                e.stopPropagation();
                setShowExporter(v => !v);
              }}
              title="Export"
              aria-label="Export document"
              style={{
                padding: '6px 10px',
                background: 'var(--bg-page)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
              }}
            >
              ↗ Export
            </button>
            {showExporter && (
              <div
                style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 200 }}
              >
                <DocExporter doc={doc} onClose={() => setShowExporter(false)} />
              </div>
            )}
          </div>

          {/* Admin actions — visible on hover */}
          {isAdmin && hovering && !isArchived && (
            <>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onTogglePin?.(doc);
                }}
                title={doc.featured ? 'Unpin from Home' : 'Pin to Home'}
                aria-label={doc.featured ? 'Unpin doc from Home' : 'Pin doc to Home'}
                style={{
                  padding: '6px 10px',
                  background: doc.featured ? 'rgba(245, 158, 11, 0.18)' : 'var(--bg-page)',
                  border: `1px solid ${doc.featured ? '#FDE68A' : 'var(--border-default)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: doc.featured ? '#92400E' : 'var(--text-secondary)',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                }}
              >
                📌 {doc.featured ? 'Pinned' : 'Pin'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  doc.review ? onClearReview?.(doc) : onFlagReview?.(doc);
                }}
                title={doc.review ? 'Mark review complete' : 'Flag for review'}
                aria-label={doc.review ? 'Mark review complete' : 'Flag doc for review'}
                style={{
                  padding: '6px 10px',
                  background: doc.review ? 'rgba(220, 38, 38, 0.18)' : 'var(--bg-page)',
                  border: `1px solid ${doc.review ? '#FCA5A5' : 'var(--border-default)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: doc.review ? '#B91C1C' : 'var(--text-secondary)',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                }}
              >
                🔁 {doc.review ? 'In Review' : 'Review'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit?.(doc);
                }}
                title="Edit"
                aria-label="Edit document"
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                }}
              >
                ✎ Edit
              </button>
            </>
          )}
          {isAdmin && isArchived && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRestore?.(doc);
              }}
              title="Restore document"
              aria-label="Restore document"
              style={{
                padding: '6px 10px',
                background: 'rgba(22, 163, 74, 0.18)',
                border: '1px solid #86EFAC',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#15803D',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
              }}
            >
              ↺ Restore
            </button>
          )}
        </div>
      )}

      {/* Review banner — visible above selection-mode hint */}
      {doc.review && !selectionMode && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 10px',
            background: 'rgba(220, 38, 38, 0.10)',
            border: '1px solid #FCA5A5',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#B91C1C',
            fontWeight: 600,
          }}
        >
          🔁 Needs review by <strong>{doc.review.reviewerName}</strong>
          {doc.review.dueDate ? <> · due {doc.review.dueDate}</> : null}
        </div>
      )}
      {doc.featured && !selectionMode && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '3px 8px',
            background: 'rgba(245, 158, 11, 0.18)',
            color: '#92400E',
            borderRadius: '100px',
            fontSize: '10px',
            fontWeight: 700,
            border: '1px solid #FDE68A',
          }}
        >
          📌 Featured
        </div>
      )}

      {/* Selection mode — tap hint at bottom */}
      {selectionMode && !isSelected && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            marginTop: 'auto',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          Tap to select
        </div>
      )}
      {selectionMode && isSelected && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-primary)',
            fontWeight: 700,
            textAlign: 'center',
            marginTop: 'auto',
            paddingTop: '8px',
            borderTop: '1px solid #BFDBFE',
          }}
        >
          ✓ Selected
        </div>
      )}
    </div>
  );
}
