// src/components/pages/PriorityGuidePage.jsx
// Static reference page: how to pick a ticket priority. First page extracted
// from PomeloTechOpsPortal.jsx (Phase 4 decomposition) — the pattern is:
// pages import shared tokens from src/lib/{styles,constants}.js and export a
// default component wired into AppContent's section switch.

import { S } from '../../lib/styles.js';

export default function PriorityGuidePage() {
  return (
    <div>
      <div style={S.pageTitle}>Priority Guide</div>
      <div style={S.pageSub}>
        Use this guide to select the right priority when submitting a ticket.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px' }}>
        {[
          {
            priority: 'Critical',
            color: '#DC2626',
            icon: '🚨',
            definition:
              'Complete work stoppage affecting one or more teams. Business-critical systems are fully down.',
            examples: [
              'Production website is down',
              'Payment processing is failing',
              'All users locked out of a core system',
            ],
            avoid: "Don't use Critical for issues that have workarounds or affect only one person.",
          },
          {
            priority: 'High',
            color: '#EA580C',
            icon: '🔴',
            definition:
              'Significant disruption to work with no easy workaround. Time-sensitive impact.',
            examples: [
              'VPN not working for remote employee with no backup',
              'Critical software crash with no alternative',
              'Security concern requiring immediate attention',
            ],
            avoid: "Don't use High if there's a reasonable workaround available.",
          },
          {
            priority: 'Medium',
            color: '#CA8A04',
            icon: '🟡',
            definition: 'Issue affecting productivity but work can continue. A workaround exists.',
            examples: [
              'Slow system performance',
              'Non-urgent software bugs',
              'Peripheral device malfunction with spare available',
            ],
            avoid: "Don't use Medium for requests (e.g., new software installs) — use Low.",
          },
          {
            priority: 'Low',
            color: '#16A34A',
            icon: '🟢',
            definition: 'Minor issues, general requests, or planned tasks with no time pressure.',
            examples: [
              'New software installation request',
              'Hardware upgrade for future use',
              'General "how do I" questions',
            ],
            avoid: "Don't use Low if the issue is actively blocking any work.",
          },
        ].map(p => (
          <div key={p.priority} style={{ ...S.card, borderLeft: `4px solid ${p.color}` }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}
            >
              <span style={{ fontSize: '20px' }}>{p.icon}</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: p.color }}>{p.priority}</div>
            </div>
            <div
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                marginBottom: '12px',
                lineHeight: 1.6,
              }}
            >
              {p.definition}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Examples
              </div>
              {p.examples.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginBottom: '3px',
                  }}
                >
                  <span style={{ color: p.color }}>•</span> {e}
                </div>
              ))}
            </div>
            <div
              style={{
                background: 'rgba(234, 88, 12, 0.08)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#92400E',
              }}
            >
              ⚠️ {p.avoid}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
