// src/components/reports/ReportsPage.jsx
// KPI dashboard: headline tiles, created-vs-resolved trend, SLA compliance by
// priority, volume breakdown (category/priority/request type), CSAT gauge +
// histogram, change success rate. Gated on reports.view.

import { useEffect, useState, useCallback } from 'react';
import { S } from '../../lib/styles.js';
import { PRIORITY_COLORS } from '../../lib/constants.js';
import {
  getOverview,
  getTrend,
  getSlaReport,
  getVolume,
  getCsatReport,
  getChangesReport,
} from '../../api/reportsApi.js';
import { StatTile, LineChart, BarChart, DonutGauge, CHART_SERIES } from './charts/primitives.jsx';
import DateField from '../DateField.jsx';

const OUTCOME_COLORS = { successful: '#16A34A', 'rolled-back': '#D97706', failed: '#DC2626' };

const card = { ...S.card, padding: '18px' };
const cardTitle = {
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: '12px',
};

const toDateInput = d => d.toISOString().slice(0, 10);

export default function ReportsPage({ onToast }) {
  const [from, setFrom] = useState(() => toDateInput(new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [volumeBy, setVolumeBy] = useState('category');
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState(null);
  const [sla, setSla] = useState(null);
  const [volume, setVolume] = useState(null);
  const [csat, setCsat] = useState(null);
  const [changes, setChanges] = useState(null);

  const reload = useCallback(async () => {
    const params = { from, to };
    const [ov, tr, sl, cs, ch] = await Promise.all([
      getOverview(params),
      getTrend(params),
      getSlaReport(params),
      getCsatReport(params),
      getChangesReport(params),
    ]);
    const firstError = [ov, tr, sl, cs, ch].find(r => r.error)?.error;
    if (firstError) onToast?.(firstError, 'error');
    if (ov.data) setOverview(ov.data);
    if (tr.data) setTrend(tr.data);
    if (sl.data) setSla(sl.data);
    if (cs.data) setCsat(cs.data);
    if (ch.data) setChanges(ch.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    (async () => {
      const { data } = await getVolume({ from, to, by: volumeBy });
      if (data) setVolume(data);
    })();
  }, [from, to, volumeBy]);

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
          <div style={S.pageTitle}>Reports</div>
          <div style={S.pageSub}>Service desk KPIs — volumes, speed, SLA, satisfaction.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <DateField
            style={{ width: '150px' }}
            value={from}
            max={to}
            onChange={e => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>→</span>
          <DateField
            style={{ width: '150px' }}
            value={to}
            min={from}
            onChange={e => setTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      {/* Headline tiles */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <StatTile label="Created" value={overview?.created} hint="tickets opened in range" />
        <StatTile label="Resolved" value={overview?.resolved} hint="tickets resolved in range" />
        <StatTile label="Open now" value={overview?.open_now} hint="current backlog" />
        <StatTile
          label="MTTR"
          value={overview?.mttr_hours}
          suffix="h"
          hint="mean time to resolve"
        />
        <StatTile
          label="First response"
          value={overview?.first_response_hours}
          suffix="h"
          hint="mean time to first reply"
        />
        <StatTile
          label="SLA compliance"
          value={overview?.slaCompliancePct}
          suffix="%"
          hint={
            overview?.slaMeasured ? `${overview.slaMeasured} measured` : 'no SLA-tracked tickets'
          }
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={cardTitle}>Created vs resolved</div>
          {trend ? (
            <LineChart
              days={trend.days}
              series={[
                { key: 'created', label: 'Created' },
                { key: 'resolved', label: 'Resolved' },
              ]}
            />
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>

        <div style={card}>
          <div style={cardTitle}>SLA compliance by priority</div>
          {sla ? (
            <BarChart
              rows={(sla.priorities || []).map(p => ({
                label: `${p.priority} (${p.met}/${p.measured})`,
                value: p.pct ?? 0,
                color: PRIORITY_COLORS[p.priority],
              }))}
              valueSuffix="%"
              maxValue={100}
            />
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>

        <div style={card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div style={{ ...cardTitle, marginBottom: 0 }}>Volume</div>
            <select
              style={{ ...S.select, width: '150px' }}
              value={volumeBy}
              onChange={e => setVolumeBy(e.target.value)}
              aria-label="Group volume by"
            >
              <option value="category">by category</option>
              <option value="priority">by priority</option>
              <option value="requestType">by request type</option>
            </select>
          </div>
          {volume ? (
            <BarChart rows={(volume.groups || []).map(g => ({ label: g.label, value: g.n }))} />
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>

        <div style={card}>
          <div style={cardTitle}>Customer satisfaction</div>
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <DonutGauge
              value={csat?.average ?? null}
              max={5}
              label={`${csat?.responses || 0} response${(csat?.responses || 0) === 1 ? '' : 's'}`}
              color={CHART_SERIES[1]}
            />
            <div style={{ flex: 1, minWidth: '160px' }}>
              <BarChart
                rows={[5, 4, 3, 2, 1].map(r => ({
                  label: `${r} star${r > 1 ? 's' : ''}`,
                  value: csat?.histogram?.[r] || 0,
                }))}
                color={CHART_SERIES[1]}
              />
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Change success</div>
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <DonutGauge
              value={changes?.successRatePct ?? null}
              max={100}
              label={`${changes?.total || 0} completed`}
            />
            <div style={{ flex: 1, minWidth: '160px' }}>
              <BarChart
                rows={Object.entries(OUTCOME_COLORS).map(([outcome, color]) => ({
                  label: outcome,
                  value: changes?.outcomes?.[outcome] || 0,
                  color,
                }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
