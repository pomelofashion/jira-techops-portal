// src/components/assets/AssetsPage.jsx
// Asset registry (CMDB-lite): filterable table with status counts, create/edit
// modal, assign/return, detail drawer (assignment history + linked tickets),
// CSV export/import. Viewing needs assets.view; mutations assets.manage —
// the page hides mutation affordances without it.

import { useEffect, useState, useCallback } from 'react';
import { Plus, Download, Upload, Search } from 'lucide-react';
import { S } from '../../lib/styles.js';
import {
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  assignAsset,
  returnAsset,
  getAsset,
  assetsCsvUrl,
  importAssets,
} from '../../api/assetsApi.js';
import AssetDetailDrawer from './AssetDetailDrawer.jsx';
import AssetFormModal from './AssetFormModal.jsx';

export const ASSET_STATUS_META = {
  'in-stock': { label: 'In stock', color: '#16A34A' },
  assigned: { label: 'Assigned', color: '#6366F1' },
  repair: { label: 'In repair', color: '#D97706' },
  retired: { label: 'Retired', color: 'var(--text-muted)' },
};
export const ASSET_TYPE_LABEL = { hardware: 'Hardware', software: 'Software', license: 'License' };

const TH = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-default)',
};
const TD = {
  padding: '10px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-subtle)',
};

// Minimal CSV parser for the import path (quotes + commas). Header row maps
// to asset fields; unknown columns are ignored.
export function parseAssetsCsv(text) {
  const rows = [];
  let cur = [''];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur[cur.length - 1] += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur[cur.length - 1] += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') cur.push('');
    else if (ch === '\n' || ch === '\r') {
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur = [''];
    } else cur[cur.length - 1] += ch;
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = name => header.indexOf(name);
  const FIELD_COLS = {
    name: col('name'),
    type: col('type'),
    serial: col('serial'),
    model: col('model'),
    vendor: col('vendor'),
    purchaseDate: col('purchase_date'),
    warrantyExpires: col('warranty_expires'),
    cost: col('cost'),
    notes: col('notes'),
  };
  return rows
    .slice(1)
    .map(r => {
      const out = {};
      for (const [field, idx] of Object.entries(FIELD_COLS)) {
        if (idx === -1) continue;
        const v = (r[idx] || '').trim();
        if (!v) continue;
        out[field] = field === 'cost' ? Number(v) : v;
      }
      if (out.type && !['hardware', 'software', 'license'].includes(out.type)) delete out.type;
      return out;
    })
    .filter(a => a.name);
}

export default function AssetsPage({ canManage, canExport, onToast }) {
  const [assets, setAssets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | asset
  const [detail, setDetail] = useState(null); // { asset, history, tickets }

  const reload = useCallback(async () => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    if (search.trim()) params.search = search.trim();
    const { data, error } = await listAssets(params);
    if (error) onToast?.(error, 'error');
    else {
      setAssets(data.assets || []);
      setCounts(data.counts || {});
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openDetail = async asset => {
    const { data, error } = await getAsset(asset.id);
    if (error) return onToast?.(error, 'error');
    setDetail(data);
  };

  const doAssign = async asset => {
    const email = window.prompt('Assign to (email):');
    if (!email) return;
    const name = window.prompt('Display name (optional):') || undefined;
    const { error } = await assignAsset(asset.id, email, name);
    if (error) return onToast?.(error, 'error');
    onToast?.(`${asset.tag} assigned to ${email}.`);
    reload();
  };

  const doReturn = async asset => {
    const { error } = await returnAsset(asset.id);
    if (error) return onToast?.(error, 'error');
    onToast?.(`${asset.tag} returned to stock.`);
    reload();
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const rows = parseAssetsCsv(text);
      if (!rows.length)
        return onToast?.('No importable rows found (need a "name" column).', 'error');
      const { data, error } = await importAssets(rows);
      if (error) return onToast?.(error, 'error');
      onToast?.(`Imported ${data.created} asset(s).`);
      reload();
    };
    input.click();
  };

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
          <div style={S.pageTitle}>Assets</div>
          <div style={S.pageSub}>Hardware, software, and licenses — who has what.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {canExport && (
            <a href={assetsCsvUrl()} style={{ textDecoration: 'none' }}>
              <button style={S.ghostBtn}>
                <Download size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                Export CSV
              </button>
            </a>
          )}
          {canManage && (
            <button style={S.ghostBtn} onClick={doImport}>
              <Upload size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              Import CSV
            </button>
          )}
          {canManage && (
            <button style={S.orangeBtn} onClick={() => setEditing('new')}>
              <Plus size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              New asset
            </button>
          )}
        </div>
      </div>

      {/* Status count chips as filters */}
      <div style={{ display: 'flex', gap: '8px', margin: '4px 0 14px', flexWrap: 'wrap' }}>
        {Object.entries(ASSET_STATUS_META).map(([status, meta]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(f => (f === status ? '' : status))}
            style={{
              ...S.ghostBtn,
              padding: '5px 12px',
              fontSize: '12px',
              borderColor: statusFilter === status ? meta.color : 'var(--border-default)',
              color: statusFilter === status ? meta.color : 'var(--text-secondary)',
            }}
          >
            {meta.label} · {counts[status] || 0}
          </button>
        ))}
        <select
          style={{ ...S.select, width: '140px' }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="hardware">Hardware</option>
          <option value="software">Software</option>
          <option value="license">License</option>
        </select>
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--text-muted)' }}
          />
          <input
            style={{ ...S.input, width: '220px', paddingLeft: '28px' }}
            placeholder="Search tag, name, serial…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ ...S.card, overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Tag</th>
                <th style={TH}>Name</th>
                <th style={TH}>Type</th>
                <th style={TH}>Status</th>
                <th style={TH}>Assigned to</th>
                <th style={TH}>Warranty</th>
                {canManage && <th style={TH} />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td style={TD} colSpan={7}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && !assets.length && (
                <tr>
                  <td style={TD} colSpan={7}>
                    No assets match.
                  </td>
                </tr>
              )}
              {assets.map(a => {
                const meta = ASSET_STATUS_META[a.status] || ASSET_STATUS_META['in-stock'];
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(a)}>
                    <td style={{ ...TD, fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {a.tag}
                    </td>
                    <td style={TD}>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {[a.model, a.serial].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td style={TD}>{ASSET_TYPE_LABEL[a.type]}</td>
                    <td style={TD}>
                      <span style={S.badge(meta.color)}>{meta.label}</span>
                    </td>
                    <td style={TD}>{a.assigneeName || a.assigneeEmail || '—'}</td>
                    <td style={TD}>
                      {a.warrantyExpires ? String(a.warrantyExpires).slice(0, 10) : '—'}
                    </td>
                    {canManage && (
                      <td
                        style={{ ...TD, whiteSpace: 'nowrap', textAlign: 'right' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {a.status === 'in-stock' && (
                          <button
                            style={{
                              ...S.ghostBtn,
                              padding: '4px 9px',
                              fontSize: '12px',
                              marginRight: '6px',
                            }}
                            onClick={() => doAssign(a)}
                          >
                            Assign
                          </button>
                        )}
                        {a.status === 'assigned' && (
                          <button
                            style={{
                              ...S.ghostBtn,
                              padding: '4px 9px',
                              fontSize: '12px',
                              marginRight: '6px',
                            }}
                            onClick={() => doReturn(a)}
                          >
                            Return
                          </button>
                        )}
                        <button
                          style={{ ...S.ghostBtn, padding: '4px 9px', fontSize: '12px' }}
                          onClick={() => setEditing(a)}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AssetFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            const { error } =
              editing === 'new'
                ? await createAsset(payload)
                : await updateAsset(editing.id, payload);
            if (error) return onToast?.(error, 'error');
            onToast?.(editing === 'new' ? 'Asset created.' : 'Asset updated.');
            setEditing(null);
            reload();
          }}
          onDelete={
            editing !== 'new'
              ? async () => {
                  if (!window.confirm(`Delete ${editing.tag}? This cannot be undone.`)) return;
                  const { error } = await deleteAsset(editing.id);
                  if (error) return onToast?.(error, 'error');
                  onToast?.(`${editing.tag} deleted.`);
                  setEditing(null);
                  reload();
                }
              : undefined
          }
        />
      )}

      {detail && (
        <AssetDetailDrawer
          detail={detail}
          onClose={() => {
            setDetail(null);
            reload();
          }}
          canManage={canManage}
          onToast={onToast}
        />
      )}
    </div>
  );
}
