// src/lib/scrubOfficeMeta.js
// Blank the author/company metadata inside zip-based Office files (docx /
// xlsx / pptx) before upload, using the already-present jszip dependency.
// Only the docProps parts are touched — document content and business fields
// (title, description) are left alone. On ANY problem the original file is
// returned untouched: never risk corrupting a document. PDFs and legacy
// binary .doc/.xls are out of scope (no safe dependency-free scrubber).

import JSZip from 'jszip';

const OFFICE_EXTS = new Set(['docx', 'xlsx', 'pptx']);
const CORE_FIELDS = ['dc:creator', 'cp:lastModifiedBy'];
const APP_FIELDS = ['Company', 'Manager'];

const escapeRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blankTags = (xml, tags) =>
  tags.reduce(
    (acc, t) =>
      acc.replace(
        new RegExp(`(<${escapeRe(t)}(?:\\s[^>]*)?>)[\\s\\S]*?(</${escapeRe(t)}>)`, 'g'),
        '$1$2'
      ),
    xml
  );

export const scrubOfficeFile = async file => {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!OFFICE_EXTS.has(ext)) return file;
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let touched = false;
    const core = zip.file('docProps/core.xml');
    if (core) {
      zip.file('docProps/core.xml', blankTags(await core.async('string'), CORE_FIELDS));
      touched = true;
    }
    const app = zip.file('docProps/app.xml');
    if (app) {
      zip.file('docProps/app.xml', blankTags(await app.async('string'), APP_FIELDS));
      touched = true;
    }
    if (!touched) return file;
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
  } catch {
    return file;
  }
};
