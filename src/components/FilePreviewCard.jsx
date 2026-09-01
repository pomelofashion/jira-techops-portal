// src/components/FilePreviewCard.jsx
// Format-aware file preview card — actual thumbnail for images, format icon
// for everything else. Click opens the file in a new browser tab when the
// format is something browsers render natively (image / PDF / text / CSV /
// video / audio). Used by Submit Ticket previews, TicketDetail attachments,
// and the Documentation page source-file viewer.

import {
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Archive,
  Video,
  Music,
  Paperclip,
  FileType,
  X,
} from 'lucide-react';
import { scrubImageFile } from '../lib/imageUtil.js';

export const FILE_CATEGORIES = {
  image: { Icon: ImageIcon, color: 'var(--accent-primary)', label: 'Image', inline: true },
  pdf: { Icon: FileText, color: '#DC2626', label: 'PDF', inline: true },
  doc: { Icon: FileType, color: '#2563EB', label: 'Word', inline: false },
  sheet: { Icon: FileSpreadsheet, color: '#16A34A', label: 'Excel', inline: false },
  slide: { Icon: Presentation, color: '#EA580C', label: 'Slides', inline: false },
  csv: { Icon: FileSpreadsheet, color: '#16A34A', label: 'CSV', inline: true },
  text: { Icon: FileText, color: 'var(--text-secondary)', label: 'Text', inline: true },
  markdown: { Icon: FileCode, color: 'var(--text-secondary)', label: 'Markdown', inline: true },
  archive: { Icon: Archive, color: '#92400E', label: 'Archive', inline: false },
  video: { Icon: Video, color: 'var(--accent-primary)', label: 'Video', inline: true },
  audio: { Icon: Music, color: 'var(--accent-primary)', label: 'Audio', inline: true },
  other: { Icon: Paperclip, color: 'var(--text-secondary)', label: 'File', inline: false },
};

export const ATTACHMENT_DATAURL_LIMIT = 1_048_576; // 1 MB

export const extOf = name =>
  (
    String(name || '')
      .split('.')
      .pop() || ''
  ).toLowerCase();

export const categoryForFile = (type = '', name = '') => {
  const ext = extOf(name);
  if ((type || '').startsWith('image/')) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext) || (type || '').includes('word')) return 'doc';
  if (
    ['xls', 'xlsx'].includes(ext) ||
    (type || '').includes('sheet') ||
    (type || '').includes('excel')
  )
    return 'sheet';
  if (
    ['ppt', 'pptx'].includes(ext) ||
    (type || '').includes('presentation') ||
    (type || '').includes('powerpoint')
  )
    return 'slide';
  if (ext === 'csv') return 'csv';
  if (ext === 'md') return 'markdown';
  if (
    ['txt', 'log', 'json', 'xml', 'yaml', 'yml'].includes(ext) ||
    (type || '').startsWith('text/')
  )
    return 'text';
  if (
    ['zip', 'tar', 'gz', 'rar', '7z'].includes(ext) ||
    (type || '').includes('zip') ||
    (type || '').includes('compressed')
  )
    return 'archive';
  if ((type || '').startsWith('video/')) return 'video';
  if ((type || '').startsWith('audio/')) return 'audio';
  return 'other';
};

export const fmtFileSize = bytes => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

// Convert a File into a persistable attachment record. Files larger than the
// data-URL limit keep only metadata (preview unavailable). Images are
// re-encoded first so EXIF/GPS data never reaches storage.
export const fileToAttachment = async rawFile => {
  const file = await scrubImageFile(rawFile);
  const meta = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: new Date().toISOString(),
  };
  if (file.size > ATTACHMENT_DATAURL_LIMIT) return { ...meta, dataUrl: null };
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve({ ...meta, dataUrl: String(reader.result || '') });
    reader.onerror = () => resolve({ ...meta, dataUrl: null });
    reader.readAsDataURL(file);
  });
};

export default function FilePreviewCard({ name, size, type, src, onRemove, compact = false }) {
  const category = categoryForFile(type, name);
  const meta = FILE_CATEGORIES[category];
  const opensInTab = meta.inline && src;
  const Wrapper = src ? 'a' : 'div';
  const thumbSize = compact ? 36 : 48;

  return (
    <Wrapper
      {...(src ? { href: src, target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: compact ? '6px 10px' : '8px 10px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: '10px',
        textDecoration: 'none',
        color: 'var(--text-primary)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        cursor: src ? 'pointer' : 'default',
      }}
      onMouseEnter={
        src
          ? e => {
              e.currentTarget.style.borderColor = meta.color;
              e.currentTarget.style.boxShadow = `0 2px 8px ${meta.color}22`;
            }
          : undefined
      }
      onMouseLeave={
        src
          ? e => {
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
      title={opensInTab ? `${name} — click to preview in a new tab` : name}
    >
      {category === 'image' && src ? (
        <img
          src={src}
          alt={name}
          style={{
            width: `${thumbSize}px`,
            height: `${thumbSize}px`,
            objectFit: 'cover',
            borderRadius: '6px',
            background: 'var(--bg-hover)',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: `${thumbSize}px`,
            height: `${thumbSize}px`,
            flexShrink: 0,
            background: meta.color + '14',
            color: meta.color,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <meta.Icon size={compact ? 18 : 22} strokeWidth={1.8} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '3px',
              background: meta.color + '14',
              color: meta.color,
              fontWeight: 700,
              fontSize: '10px',
              letterSpacing: '0.03em',
            }}
          >
            {meta.label.toUpperCase()}
          </span>
          <span>{fmtFileSize(size)}</span>
          {opensInTab && <span style={{ color: '#9CA3AF' }}>· opens in a new tab</span>}
          {!src && size > ATTACHMENT_DATAURL_LIMIT && (
            <span style={{ color: '#92400E' }}>· preview unavailable (over 1 MB)</span>
          )}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name}`}
          title="Remove"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 6px',
            flexShrink: 0,
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
    </Wrapper>
  );
}
