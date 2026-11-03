const K = { ok: ['var(--st-ok)', '✓'], info: ['var(--st-info)', '●'], warn: ['var(--st-warn)', '▲'], bad: ['var(--st-bad)', '✕'], neutral: ['var(--surf2)', '○'] };
export function StatusChip({ status = 'neutral', children }) {
  const [bg, glyph] = K[status];
  return <span style={{ display: 'inline-flex', gap: 6, padding: '3px 10px', borderRadius: 999, background: bg, color: status === 'neutral' ? 'var(--ink)' : 'var(--st-on)', border: status === 'neutral' ? '1px solid var(--bd)' : '1px solid transparent', font: '600 11.5px var(--font)', whiteSpace: 'nowrap' }}>{glyph} {children}</span>;
}
