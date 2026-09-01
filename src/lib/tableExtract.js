// src/lib/tableExtract.js
// Deterministic client-side table extraction for structured uploads — no AI
// round-trip, no new dependencies. CSV goes through a small quote-aware
// parser; XLSX is unzipped with the existing jszip dep and its sheet XML read
// via the browser's DOMParser. Both emit GitHub-flavored markdown tables that
// MarkdownView renders as real <table>s. The row cap keeps giant spreadsheets
// from flooding a doc body — the stored original file keeps the full data.

import JSZip from 'jszip';

const MAX_ROWS = 200; // data rows per table

const escCell = v =>
  String(v ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();

// rows: array of string arrays; first row is the header.
export const rowsToMarkdownTable = rows => {
  if (!rows.length) return '';
  const width = Math.max(...rows.map(r => r.length), 1);
  const pad = r => {
    const out = r.slice(0, width).map(escCell);
    while (out.length < width) out.push('');
    return out;
  };
  const header = pad(rows[0]);
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  const body = rows.slice(1, 1 + MAX_ROWS);
  for (const r of body) lines.push(`| ${pad(r).join(' | ')} |`);
  let md = lines.join('\n');
  const extra = rows.length - 1 - body.length;
  if (extra > 0) md += `\n\n_…${extra} more row${extra === 1 ? '' : 's'} in the original file._`;
  return md;
};

// Quote-aware CSV parser: handles quoted fields with commas, doubled ("")
// escape quotes, and CRLF line endings. Returns array of row arrays.
export const parseCsv = text => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  while (rows.length && rows[rows.length - 1].every(v => !v.trim())) rows.pop();
  return rows;
};

export const csvToMarkdown = (text, title = '') => {
  const rows = parseCsv(text || '');
  if (!rows.length) return null;
  const cols = Math.max(...rows.map(r => r.length));
  const dataRows = rows.length - 1;
  const head = title ? `# ${title}\n\n` : '';
  const summary = `_${dataRows} data row${dataRows === 1 ? '' : 's'} × ${cols} column${cols === 1 ? '' : 's'}._`;
  return `${head}${summary}\n\n${rowsToMarkdownTable(rows)}`;
};

// "BC12" → 0-based column index 54.
const colIndex = ref => {
  let n = 0;
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return n > 0 ? n - 1 : 0;
};

const XML_RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Parse an xlsx into one "## Sheet name" + markdown table per non-empty
// sheet. Returns null on any failure so the caller's placeholder fallback
// applies — never throws.
export const xlsxToMarkdown = async file => {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const parseXml = async path => {
      const f = zip.file(path);
      if (!f) return null;
      const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
      return doc.getElementsByTagName('parsererror').length ? null : doc;
    };

    const sstDoc = await parseXml('xl/sharedStrings.xml');
    const shared = sstDoc
      ? Array.from(sstDoc.getElementsByTagName('si')).map(si =>
          Array.from(si.getElementsByTagName('t'))
            .map(t => t.textContent)
            .join('')
        )
      : [];

    const wb = await parseXml('xl/workbook.xml');
    if (!wb) return null;
    const rels = await parseXml('xl/_rels/workbook.xml.rels');
    const relMap = {};
    if (rels) {
      for (const r of Array.from(rels.getElementsByTagName('Relationship'))) {
        relMap[r.getAttribute('Id')] = r.getAttribute('Target') || '';
      }
    }

    const sections = [];
    for (const sh of Array.from(wb.getElementsByTagName('sheet'))) {
      const name = sh.getAttribute('name') || 'Sheet';
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS(XML_RELS_NS, 'id');
      let target = relMap[rid];
      if (!target) continue;
      target = target.replace(/^\//, '');
      if (!target.startsWith('xl/')) target = `xl/${target}`;
      const ws = await parseXml(target);
      if (!ws) continue;

      const rows = [];
      for (const rowEl of Array.from(ws.getElementsByTagName('row'))) {
        const out = [];
        for (const c of Array.from(rowEl.getElementsByTagName('c'))) {
          const idx = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : out.length;
          const type = c.getAttribute('t');
          let val = '';
          if (type === 'inlineStr') {
            val = Array.from(c.getElementsByTagName('t'))
              .map(t => t.textContent)
              .join('');
          } else {
            const v = c.getElementsByTagName('v')[0];
            val = v ? v.textContent : '';
            if (type === 's') val = shared[Number(val)] ?? '';
            else if (type === 'b') val = val === '1' ? 'TRUE' : 'FALSE';
          }
          out[idx] = val;
        }
        rows.push(Array.from(out, v => v ?? ''));
      }
      while (rows.length && rows[rows.length - 1].every(v => !String(v).trim())) rows.pop();
      if (!rows.length) continue;
      sections.push(`## ${name}\n\n${rowsToMarkdownTable(rows)}`);
    }
    return sections.length ? sections.join('\n\n') : null;
  } catch {
    return null;
  }
};
