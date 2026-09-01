// src/components/pages/SLAPage.jsx
// Static reference page: SLA commitments per priority, support hours, and
// standards. Extracted from PomeloTechOpsPortal.jsx (Phase 4 decomposition).

import { S } from '../../lib/styles.js';
import { SLA_DATA } from '../../lib/constants.js';
import { API_ENABLED } from '../../api/client.js';
import SlaPolicyEditor from '../sla/SlaPolicyEditor.jsx';

export default function SLAPage({ canManage = false, onToast }) {
  return (
    <div>
      <div style={S.pageTitle}>SLA & Standards</div>
      <div style={S.pageSub}>
        Our committed response and resolution times for each priority level.
      </div>

      {API_ENABLED ? (
        <SlaPolicyEditor canManage={canManage} onToast={onToast} />
      ) : (
        <StaticSlaTable />
      )}

      <SupportInfoCards />
    </div>
  );
}

function StaticSlaTable() {
  return (
    <div>
      <div style={{ ...S.card, marginBottom: '24px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-default)' }}>
                {['Priority', 'Response Time', 'Resolution Target', 'Status'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLA_DATA.map((row, i) => (
                <tr
                  key={row.priority}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-surface)',
                  }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <span style={S.badge(row.color)}>{row.priority}</span>
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {row.response}
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {row.resolution}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        color: '#16A34A',
                        fontWeight: 700,
                        background: 'rgba(22, 163, 74, 0.18)',
                        padding: '3px 10px',
                        borderRadius: '100px',
                      }}
                    >
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SupportInfoCards() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={S.card}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '12px',
            }}
          >
            Support Hours
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              ['Monday – Friday', '9:30 AM – 6:30 PM (ICT)'],
              ['Saturday', 'On-call only'],
              ['Sunday & Public Holidays', 'Emergency only'],
              ['Emergency Channel', 'Slack #techops-urgent'],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '12px',
            }}
          >
            Standards & Compliance
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              'All tickets acknowledged within SLA response time',
              'Status updates every 4 hours for Critical/High tickets',
              'Root cause analysis provided for all Critical incidents',
              'Monthly SLA report shared with department heads',
              'Escalation to IT Manager after 2× resolution time',
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
