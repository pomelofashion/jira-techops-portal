// src/components/docs/DocExporter.jsx
// Export a document in PDF, DOCX, MD, TXT, or CSV. Supports bulk ZIP export.

import { useState, useRef, useEffect } from 'react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
  Footer,
  AlignmentType,
} from 'docx';

const FORMATS = [
  {
    id: 'PDF',
    label: 'PDF',
    icon: '📄',
    desc: 'Formatted, print-ready',
    ext: '.pdf',
    color: '#DC2626',
  },
  {
    id: 'DOCX',
    label: 'Word (DOCX)',
    icon: '📝',
    desc: 'Microsoft Word document',
    ext: '.docx',
    color: '#2563EB',
  },
  {
    id: 'MD',
    label: 'Markdown',
    icon: '⬇️',
    desc: 'Raw markdown text',
    ext: '.md',
    color: '#16A34A',
  },
  {
    id: 'TXT',
    label: 'Plain Text',
    icon: '📃',
    desc: 'Stripped plain text',
    ext: '.txt',
    color: '#64748B',
  },
  {
    id: 'CSV',
    label: 'CSV (metadata)',
    icon: '📊',
    desc: 'Title, category, tags, date',
    ext: '.csv',
    color: '#D97706',
  },
];

const estSize = (doc, fmt) => {
  const base = doc?.fileSize || 20000;
  const m = { PDF: 1.2, DOCX: 0.9, MD: 0.3, TXT: 0.25, CSV: 0.05 };
  const bytes = Math.round(base * (m[fmt] || 1));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const slug = title => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ─── Export engines ────────────────────────────────────────────────────────────
const exportPDF = doc => {
  const w = window.open('', '_blank');
  if (!w) return;
  const date = new Date(doc.updatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  w.document.write(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${doc.title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Georgia, serif; font-size: 13px; color: #1E293B; line-height: 1.7; }
      .header { background: #111111; color: #fff; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
      .header-left { display: flex; align-items: center; gap: 12px; }
      .logo { font-family: 'Lato', sans-serif; font-size: 18px; font-weight: 900; }
      .logo span { color: #7C3AED; }
      .badge { background: #7C3AED; color: #fff; padding: 3px 10px; border-radius: 100px; font-size: 11px; font-family: 'Lato', sans-serif; font-weight: 700; }
      .content { padding: 36px 40px; max-width: 800px; margin: 0 auto; }
      h1 { font-family: 'Lato', sans-serif; font-size: 24px; font-weight: 900; color: #111111; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #64748B; margin-bottom: 24px; font-family: 'Lato', sans-serif; }
      .divider { border: none; border-top: 2px solid #7C3AED; margin: 20px 0; }
      h2 { font-family: 'Lato', sans-serif; font-size: 16px; font-weight: 700; color: #111111; margin: 20px 0 8px; }
      p, li { margin-bottom: 8px; }
      code { background: #F1F5F9; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
      .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 12px 32px; background: #F8F9FB; border-top: 1px solid #E2E8F0; font-family: 'Lato', sans-serif; font-size: 11px; color: #94A3B8; display: flex; justify-content: space-between; }
    </style></head><body>
    <div class="header">
      <div class="header-left">
        <div class="logo">Pomelo <span>TechOps</span></div>
        <span class="badge">${doc.category}</span>
      </div>
      <div style="font-size:11px;opacity:0.6;font-family:'Lato',sans-serif;">${date} · v${doc.version || '1.0'}</div>
    </div>
    <div class="content">
      <h1>${doc.title}</h1>
      <div class="meta">Author: ${doc.author || 'Pomelo IT'} &nbsp;·&nbsp; Version: ${doc.version || '1.0'} &nbsp;·&nbsp; Last updated: ${date}</div>
      <hr class="divider"/>
      <div>${(doc.content || doc.description || '')
        .replace(/\n/g, '<br/>')
        .replace(/##\s(.+)/g, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')}</div>
    </div>
    <div class="footer">
      <span>Pomelo TechOps | Confidential</span>
      <span>${doc.title}</span>
      <span>Generated ${new Date().toLocaleDateString()}</span>
    </div>
    <script>window.onload = () => { window.print(); }</script>
    </body></html>
  `);
  w.document.close();
};

const exportDOCX = async doc => {
  const date = new Date(doc.updatedAt).toLocaleDateString();
  const document = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Pomelo TechOps Portal  |  ${doc.category}`,
                    bold: true,
                    color: '111111',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Pomelo TechOps | Confidential | ${doc.title} | ${date}`,
                    color: '94A3B8',
                    size: 18,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1, thematicBreak: false }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Author: ${doc.author || 'Pomelo IT'}  ·  Version: ${doc.version || '1.0'}  ·  Category: ${doc.category}  ·  Updated: ${date}`,
                color: '64748B',
                size: 20,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          ...(doc.content || doc.description || '').split('\n').map(
            line =>
              new Paragraph({
                children: [new TextRun({ text: line.replace(/^#+\s*/, '').replace(/\*\*/g, '') })],
                heading: /^##\s/.test(line)
                  ? HeadingLevel.HEADING_2
                  : /^#\s/.test(line)
                    ? HeadingLevel.HEADING_1
                    : undefined,
              })
          ),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  saveAs(blob, `${slug(doc.title)}.docx`);
};

const exportMD = doc => {
  const content = doc.content || `# ${doc.title}\n\n${doc.description}`;
  const full = `---\ntitle: ${doc.title}\ncategory: ${doc.category}\nauthor: ${doc.author || 'Pomelo IT'}\nversion: ${doc.version || '1.0'}\nupdated: ${doc.updatedAt}\ntags: ${(doc.tags || []).join(', ')}\n---\n\n${content}`;
  saveAs(new Blob([full], { type: 'text/markdown;charset=utf-8' }), `${slug(doc.title)}.md`);
};

const exportTXT = doc => {
  const text = (doc.content || doc.description || '')
    .replace(/[#*`]/g, '')
    .replace(/\n{3,}/g, '\n\n');
  const full = `${doc.title.toUpperCase()}\n${'─'.repeat(doc.title.length)}\nCategory: ${doc.category} | Author: ${doc.author || 'Pomelo IT'} | Version: ${doc.version || '1.0'}\nLast Updated: ${new Date(doc.updatedAt).toLocaleDateString()}\n\n${text}\n\nPomelo TechOps Portal | Confidential`;
  saveAs(new Blob([full], { type: 'text/plain;charset=utf-8' }), `${slug(doc.title)}.txt`);
};

const exportCSV = doc => {
  const headers = [
    'title',
    'category',
    'format',
    'author',
    'version',
    'tags',
    'visibility',
    'status',
    'createdAt',
    'updatedAt',
  ];
  const row = [
    doc.title,
    doc.category,
    doc.format,
    doc.author || '',
    doc.version || '1.0',
    (doc.tags || []).join('; '),
    doc.visibility || 'Public',
    doc.status || 'Active',
    doc.createdAt,
    doc.updatedAt,
  ];
  const csv = [
    headers.join(','),
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','),
  ].join('\n');
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug(doc.title)}-metadata.csv`);
};

// ─── Bulk ZIP export ───────────────────────────────────────────────────────────
export const bulkZipExport = async (docs, format = 'MD') => {
  const zip = new JSZip();
  const date = new Date().toISOString().split('T')[0];

  const readme = `POMELO TECHOPS PORTAL — DOCUMENT EXPORT\n${'═'.repeat(44)}\nExport Date: ${date}\nTotal Documents: ${docs.length}\nFormat: ${format}\n\nIncluded Files:\n${docs.map((d, i) => `  ${i + 1}. ${d.title} (${d.category})`).join('\n')}\n\nPomelo TechOps | Confidential`;
  zip.file('README.txt', readme);

  for (const doc of docs) {
    const name = slug(doc.title);
    if (format === 'MD') {
      const md = `---\ntitle: ${doc.title}\ncategory: ${doc.category}\n---\n\n${doc.content || doc.description}`;
      zip.file(`${name}.md`, md);
    } else if (format === 'TXT') {
      zip.file(`${name}.txt`, (doc.content || doc.description || '').replace(/[#*`]/g, ''));
    } else if (format === 'CSV') {
      zip.file(
        `${name}-meta.csv`,
        `title,category,author,version,tags\n"${doc.title}","${doc.category}","${doc.author || ''}","${doc.version || '1.0'}","${(doc.tags || []).join('; ')}"`
      );
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `pomelo-techops-docs-${date}.zip`);
};

// ─── Export Dropdown ──────────────────────────────────────────────────────────
export default function DocExporter({ doc, onClose }) {
  const [selected, setSelected] = useState('PDF');
  const [working, setWorking] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose?.();
    };
    const handleClick = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const doExport = async () => {
    setWorking(true);
    try {
      if (selected === 'PDF') exportPDF(doc);
      else if (selected === 'DOCX') await exportDOCX(doc);
      else if (selected === 'MD') exportMD(doc);
      else if (selected === 'TXT') exportTXT(doc);
      else if (selected === 'CSV') exportCSV(doc);
    } finally {
      setWorking(false);
      onClose?.();
    }
  };

  return (
    <div
      ref={ref}
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        width: '280px',
        overflow: 'hidden',
        fontFamily: "'Lato', sans-serif",
      }}
    >
      <div style={{ background: '#111111', padding: '14px 16px' }}>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: '13px' }}>Export Document</div>
        <div
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: '11px',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {doc?.title}
        </div>
      </div>

      <div style={{ padding: '10px 8px' }}>
        {FORMATS.map(fmt => (
          <button
            key={fmt.id}
            onClick={() => setSelected(fmt.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 10px',
              borderRadius: '8px',
              border: selected === fmt.id ? `1.5px solid ${fmt.color}` : '1.5px solid transparent',
              background: selected === fmt.id ? `${fmt.color}10` : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.12s',
              marginBottom: '2px',
            }}
          >
            <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{fmt.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#111111' }}>{fmt.label}</div>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>{fmt.desc}</div>
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
              {estSize(doc, fmt.id)}
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: '0 10px 10px', display: 'flex', gap: '6px' }}>
        <button
          onClick={doExport}
          disabled={working}
          style={{
            flex: 1,
            padding: '10px',
            background: working ? '#CBD5E1' : '#7C3AED',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontFamily: "'Lato', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            cursor: working ? 'not-allowed' : 'pointer',
          }}
        >
          {working ? 'Exporting…' : `Export ${selected}`}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '10px 14px',
            background: 'transparent',
            border: '1.5px solid #E2E8F0',
            borderRadius: '8px',
            fontFamily: "'Lato', sans-serif",
            fontSize: '13px',
            cursor: 'pointer',
            color: '#64748B',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
