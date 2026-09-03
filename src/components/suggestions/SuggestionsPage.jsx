// src/components/suggestions/SuggestionsPage.jsx
// Suggestions board — a Reddit-style feedback system where users post requests
// for features, docs, or changes; the community up/down-votes; and anyone
// (staff stand out with a role badge) can comment with image/video resources.
// Admins/developers triage with status badges.
//
// Lives under the Resources dropdown. Self-contained: receives currentUser +
// can() from the host so it needs no app context. Persists via suggestionsStore
// (localStorage today; same shape for the future /api/suggestions + S3 layer).

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Image as ImageIcon,
  Video,
  Trash2,
  X,
  Send,
  Shield,
  Search,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { MarkdownView } from '../docs/MarkdownView.jsx';
import { SEED_ROLES } from '../../rbac.js';
import {
  loadSuggestions,
  hydrateSuggestions,
  subscribeSuggestions,
  createSuggestion,
  voteSuggestion,
  setStatus,
  deleteSuggestion,
  addComment,
  deleteComment,
  scoreOf,
  hotRank,
  resolveVideo,
  STATUSES,
  STATUS_META,
  CATEGORIES,
  IMAGE_MAX_BYTES,
} from './suggestionsStore.js';

const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: '12px',
};
const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: "'Inter', sans-serif",
  boxSizing: 'border-box',
  outline: 'none',
};
const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '5px',
  display: 'block',
};

const timeAgo = iso => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

// ─── Small shared bits ────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.Open;
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 700,
        color: m.color,
        background: m.bg,
        padding: '3px 9px',
        borderRadius: '999px',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}

function RoleBadge({ label, color, isStaff }) {
  if (!isStaff) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '10px',
        fontWeight: 800,
        color: '#fff',
        background: color || '#6366F1',
        padding: '1px 7px',
        borderRadius: '999px',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}
    >
      <Shield size={9} strokeWidth={2.6} /> {label}
    </span>
  );
}

function VoteControl({ score, myVote, onVote, vertical = true }) {
  const arrow = (dir, Icon) => (
    <button
      type="button"
      onClick={() => onVote(dir)}
      aria-label={dir === 1 ? 'Upvote' : 'Downvote'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px',
        lineHeight: 0,
        color: myVote === dir ? (dir === 1 ? '#16A34A' : '#DC2626') : 'var(--text-muted)',
      }}
    >
      <Icon size={20} strokeWidth={2.4} />
    </button>
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: '2px',
      }}
    >
      {arrow(1, ChevronUp)}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          minWidth: '20px',
          textAlign: 'center',
        }}
      >
        {score}
      </span>
      {arrow(-1, ChevronDown)}
    </div>
  );
}

function AttachmentView({ att }) {
  if (att.type === 'image') {
    return (
      <img
        src={att.src}
        alt=""
        style={{
          maxWidth: '100%',
          maxHeight: '360px',
          borderRadius: '8px',
          border: '1px solid var(--border-default)',
          marginTop: '6px',
          display: 'block',
        }}
      />
    );
  }
  if (att.type === 'video') {
    if (att.kind === 'embed') {
      return (
        <div
          style={{
            position: 'relative',
            paddingTop: '56.25%',
            marginTop: '6px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--border-default)',
          }}
        >
          <iframe
            src={att.src}
            title="video"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        </div>
      );
    }
    if (att.kind === 'direct') {
      return (
        <video
          src={att.src}
          controls
          style={{
            maxWidth: '100%',
            maxHeight: '360px',
            borderRadius: '8px',
            marginTop: '6px',
            display: 'block',
          }}
        />
      );
    }
    return (
      <a
        href={att.src}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '6px',
          color: 'var(--accent-primary)',
          fontSize: '13px',
        }}
      >
        <Video size={14} /> {att.src}
      </a>
    );
  }
  return null;
}

// ─── Comment composer (text + image upload + video/image link) ────────────────
function CommentComposer({ onSubmit, onCancel, placeholder, onToast, autoFocus }) {
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const fileRef = useRef(null);

  const addImage = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onToast?.('Only image files can be uploaded.', 'error');
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      onToast?.('Image is too large (max ~1.5MB). Paste a link instead.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachments(a => [...a, { type: 'image', src: reader.result }]);
    reader.readAsDataURL(file);
  };

  const addVideo = () => {
    const resolved = resolveVideo(videoUrl);
    if (!resolved) return;
    setAttachments(a => [...a, { type: 'video', kind: resolved.kind, src: resolved.src }]);
    setVideoUrl('');
    setShowVideo(false);
  };

  const submit = () => {
    if (!body.trim() && attachments.length === 0) {
      onToast?.('Write something or attach a resource.', 'error');
      return;
    }
    onSubmit({ body: body.trim(), attachments });
    setBody('');
    setAttachments([]);
  };

  return (
    <div style={{ ...card, padding: '10px', background: 'var(--bg-page)' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder || 'Add a comment… (Markdown supported)'}
        autoFocus={autoFocus}
        style={{ ...inputStyle, minHeight: '70px', resize: 'vertical', lineHeight: 1.6 }}
      />

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '8px 0' }}>
          {attachments.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              {a.type === 'image' ? <ImageIcon size={13} /> : <Video size={13} />}
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.type === 'image'
                  ? a.src.startsWith('data:')
                    ? 'Uploaded image'
                    : a.src
                  : a.src}
              </span>
              <button
                type="button"
                onClick={() => setAttachments(arr => arr.filter((_, j) => j !== i))}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showVideo && (
        <div style={{ display: 'flex', gap: '6px', margin: '8px 0' }}>
          <input
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="Paste a YouTube, Loom, Vimeo, or .mp4 link"
            style={inputStyle}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addVideo();
              }
            }}
          />
          <button type="button" onClick={addVideo} style={miniBtn(true)}>
            Add
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={addImage}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={miniBtn(false)}
          title="Upload an image"
        >
          <ImageIcon size={14} /> Image
        </button>
        <button
          type="button"
          onClick={() => setShowVideo(v => !v)}
          style={miniBtn(false)}
          title="Add a video link"
        >
          <Video size={14} /> Video
        </button>
        <div style={{ flex: 1 }} />
        {onCancel && (
          <button type="button" onClick={onCancel} style={miniBtn(false)}>
            Cancel
          </button>
        )}
        <button type="button" onClick={submit} style={{ ...miniBtn(true), gap: '5px' }}>
          <Send size={13} /> Comment
        </button>
      </div>
    </div>
  );
}

const miniBtn = primary => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 11px',
  borderRadius: '7px',
  border: primary ? 'none' : '1px solid var(--border-default)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  background: primary ? 'var(--accent-primary)' : 'var(--bg-surface)',
  color: primary ? '#fff' : 'var(--text-secondary)',
  fontFamily: "'Inter', sans-serif",
});

// ─── One comment (+ its replies) ──────────────────────────────────────────────
function CommentNode({ node, depth, me, onReply, onDelete }) {
  const [replying, setReplying] = useState(false);
  const canDelete = me.isStaff || node.authorEmail === me.email;
  return (
    <div
      style={{
        marginLeft: depth ? '20px' : 0,
        marginTop: '10px',
        borderLeft: depth ? '2px solid var(--border-subtle)' : 'none',
        paddingLeft: depth ? '12px' : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {node.authorName}
        </span>
        <RoleBadge
          label={node.authorRoleLabel}
          color={node.authorRoleColor}
          isStaff={node.isStaff}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {timeAgo(node.createdAt)}
        </span>
      </div>
      {node.body && (
        <div style={{ marginTop: '2px' }}>
          <MarkdownView content={node.body} />
        </div>
      )}
      {(node.attachments || []).map((a, i) => (
        <AttachmentView key={i} att={a} />
      ))}
      <div style={{ display: 'flex', gap: '14px', marginTop: '4px' }}>
        <button type="button" onClick={() => setReplying(r => !r)} style={linkBtn}>
          Reply
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            style={{ ...linkBtn, color: '#DC2626' }}
          >
            Delete
          </button>
        )}
      </div>
      {replying && (
        <div style={{ marginTop: '8px' }}>
          <CommentComposer
            autoFocus
            placeholder={`Reply to ${node.authorName}…`}
            onCancel={() => setReplying(false)}
            onToast={me.onToast}
            onSubmit={payload => {
              onReply(node.id, payload);
              setReplying(false);
            }}
          />
        </div>
      )}
      {node.children.map(child => (
        <CommentNode
          key={child.id}
          node={child}
          depth={depth + 1}
          me={me}
          onReply={onReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

const linkBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 700,
  padding: 0,
};

// Build a nested tree from the flat comment list.
function buildTree(comments) {
  const byId = new Map((comments || []).map(c => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).children.push(c);
    else roots.push(c);
  }
  const sortRec = nodes => {
    nodes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    nodes.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// ─── Post detail ──────────────────────────────────────────────────────────────
function Detail({
  item,
  me,
  onBack,
  onVote,
  onComment,
  onDeleteComment,
  onSetStatus,
  onDeleteSuggestion,
}) {
  const tree = useMemo(() => buildTree(item.comments), [item.comments]);
  const commentCount = (item.comments || []).length;
  return (
    <div style={{ ...card, padding: '0', overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            ...linkBtn,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: 'var(--text-secondary)',
          }}
        >
          <ArrowLeft size={15} /> Back
        </button>
      </div>
      <div style={{ display: 'flex', padding: '18px' }}>
        <div style={{ marginRight: '14px' }}>
          <VoteControl
            score={scoreOf(item)}
            myVote={item.votes?.[me.email]}
            onVote={dir => onVote(item.id, dir)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '6px',
            }}
          >
            <StatusBadge status={item.status} />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {item.category}
            </span>
            {item.pageLabel && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '100px',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-primary)',
                }}
              >
                📍 {item.pageLabel}
              </span>
            )}
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              margin: '0 0 6px',
            }}
          >
            {item.title}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {item.authorName}
            </span>
            <RoleBadge
              label={item.authorRoleLabel}
              color={item.authorRoleColor}
              isStaff={item.authorIsStaff}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              · {timeAgo(item.createdAt)}
            </span>
          </div>
          {item.body && (
            <div style={{ marginBottom: '14px' }}>
              <MarkdownView content={item.body} />
            </div>
          )}

          {/* Staff controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              padding: '10px 0',
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            {me.isStaff ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                Status
                <select
                  value={item.status}
                  onChange={e => onSetStatus(item.id, e.target.value)}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 8px' }}
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {commentCount} comment{commentCount === 1 ? '' : 's'}
              </span>
            )}
            <div style={{ flex: 1 }} />
            {(me.isStaff || item.authorEmail === me.email) && (
              <button
                type="button"
                onClick={() => onDeleteSuggestion(item.id)}
                style={{
                  ...linkBtn,
                  color: '#DC2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Trash2 size={13} /> Delete post
              </button>
            )}
          </div>

          {/* New top-level comment */}
          <div style={{ margin: '14px 0' }}>
            <CommentComposer
              onSubmit={payload => onComment(item.id, null, payload)}
              onToast={me.onToast}
            />
          </div>

          {/* Thread */}
          {commentCount === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
              No comments yet — start the discussion.
            </div>
          ) : (
            tree.map(node => (
              <CommentNode
                key={node.id}
                node={node}
                depth={0}
                me={me}
                onReply={(pid, p) => onComment(item.id, pid, p)}
                onDelete={cid => onDeleteComment(item.id, cid)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────
function Row({ item, me, onOpen, onVote }) {
  const count = (item.comments || []).length;
  return (
    <div
      style={{ ...card, display: 'flex', padding: '12px 14px', gap: '12px', cursor: 'pointer' }}
      onClick={() => onOpen(item.id)}
    >
      <div onClick={e => e.stopPropagation()}>
        <VoteControl
          score={scoreOf(item)}
          myVote={item.votes?.[me.email]}
          onVote={dir => onVote(item.id, dir)}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '3px',
          }}
        >
          <StatusBadge status={item.status} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {item.category}
          </span>
          {item.pageLabel && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '100px',
                background: 'var(--accent-soft)',
                color: 'var(--accent-primary)',
              }}
            >
              📍 {item.pageLabel}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '4px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {item.authorName}
          </span>
          <RoleBadge
            label={item.authorRoleLabel}
            color={item.authorRoleColor}
            isStaff={item.authorIsStaff}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            · {timeAgo(item.createdAt)}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <MessageCircle size={13} /> {count}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Composer modal (new suggestion) ──────────────────────────────────────────
function Composer({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Feature');
  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 400 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New suggestion"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 401,
          width: '600px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          ...card,
          padding: '22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--text-primary)' }}>
            Share a suggestion
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What would you like to see?"
            style={inputStyle}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Details (Markdown supported)</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Describe the change, why it helps, and any examples…"
            style={{ ...inputStyle, minHeight: '140px', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={miniBtn(false)}>
            Cancel
          </button>
          <button
            onClick={() => onCreate({ title: title.trim(), body: body.trim(), category })}
            style={miniBtn(true)}
          >
            Post suggestion
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SuggestionsPage({ currentUser, can, onToast }) {
  const [items, setItems] = useState(loadSuggestions);
  // Live board: subscribe to store changes (feedback-bubble posts, background
  // re-syncs), hydrate from the server on mount, and re-sync every 30s while
  // open so other users' posts and votes appear without a manual refresh.
  useEffect(() => {
    const unsubscribe = subscribeSuggestions(() => setItems(loadSuggestions()));
    let cancelled = false;
    hydrateSuggestions().then(list => {
      if (!cancelled) setItems(list);
    });
    const timer = setInterval(() => hydrateSuggestions(), 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  const [sort, setSort] = useState('hot'); // hot | new | top
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [composing, setComposing] = useState(false);

  const isStaff = Boolean(
    can?.('admin.kanban_view') || can?.('tickets.view_all') || can?.('docs.manage')
  );
  const myRole = useMemo(() => {
    const r = SEED_ROLES.find(x => x.id === currentUser?.roleId);
    return { label: r?.label || 'User', color: r?.color || '#52525B' };
  }, [currentUser?.roleId]);
  const me = {
    email: currentUser?.email || 'anon',
    name: currentUser?.name || 'You',
    isStaff,
    onToast,
  };

  const requireAuthed = () => {
    if (!currentUser?.email) {
      onToast?.('Sign in to participate.', 'error');
      return false;
    }
    return true;
  };

  const onVote = (id, dir) => {
    if (requireAuthed()) setItems(voteSuggestion(id, me.email, dir));
  };
  const onSetStatus = (id, status) => setItems(setStatus(id, status));
  const onDeleteSuggestion = id => {
    setItems(deleteSuggestion(id));
    setActiveId(null);
    onToast?.('Suggestion deleted.');
  };
  const onDeleteComment = (id, cid) => setItems(deleteComment(id, cid));
  const onComment = (id, parentId, payload) => {
    if (!requireAuthed()) return;
    setItems(
      addComment(id, {
        parentId,
        authorName: me.name,
        authorEmail: me.email,
        authorRoleLabel: myRole.label,
        authorRoleColor: myRole.color,
        isStaff,
        body: payload.body,
        attachments: payload.attachments,
      })
    );
  };
  const create = ({ title, body, category }) => {
    if (!title) {
      onToast?.('Give your suggestion a title.', 'error');
      return;
    }
    if (!requireAuthed()) return;
    setItems(
      createSuggestion({
        title,
        body,
        category,
        authorName: me.name,
        authorEmail: me.email,
        authorRoleLabel: myRole.label,
        authorRoleColor: myRole.color,
        authorIsStaff: isStaff,
      })
    );
    setComposing(false);
    onToast?.('Suggestion posted.');
  };

  const active = items.find(s => s.id === activeId);

  const visible = useMemo(() => {
    let list = [...items];
    if (statusFilter !== 'All') list = list.filter(s => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        s => s.title.toLowerCase().includes(q) || (s.body || '').toLowerCase().includes(q)
      );
    }
    if (sort === 'new') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === 'top') list.sort((a, b) => scoreOf(b) - scoreOf(a));
    else list.sort((a, b) => hotRank(b) - hotRank(a));
    return list;
  }, [items, statusFilter, search, sort]);

  if (active) {
    return (
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        <Detail
          item={active}
          me={me}
          onBack={() => setActiveId(null)}
          onVote={onVote}
          onComment={onComment}
          onDeleteComment={onDeleteComment}
          onSetStatus={onSetStatus}
          onDeleteSuggestion={onDeleteSuggestion}
        />
      </div>
    );
  }

  const sortTab = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setSort(id)}
      style={{
        padding: '6px 14px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 700,
        background: sort === id ? 'var(--accent-primary)' : 'transparent',
        color: sort === id ? '#fff' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 900,
              color: 'var(--text-primary)',
              margin: '0 0 2px',
            }}
          >
            💡 Suggestions
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Request features, docs, or changes. Vote on what matters and discuss with the team.
          </p>
        </div>
        <button
          onClick={() => {
            if (requireAuthed()) setComposing(true);
          }}
          style={{ ...miniBtn(true), padding: '10px 16px', fontSize: '13px' }}
        >
          <Plus size={15} /> New suggestion
        </button>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--bg-page)',
            borderRadius: '10px',
            padding: '3px',
          }}
        >
          {sortTab('hot', 'Hot')}
          {sortTab('new', 'New')}
          {sortTab('top', 'Top')}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search suggestions…"
            style={{ ...inputStyle, paddingLeft: '32px' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="All">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {visible.length === 0 ? (
          <div
            style={{ ...card, padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}
          >
            No suggestions match. Be the first to post one!
          </div>
        ) : (
          visible.map(item => (
            <Row key={item.id} item={item} me={me} onOpen={setActiveId} onVote={onVote} />
          ))
        )}
      </div>

      {composing && <Composer onClose={() => setComposing(false)} onCreate={create} />}
    </div>
  );
}
