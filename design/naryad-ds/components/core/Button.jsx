export function Button({ variant = 'primary', size = 'md', children, ...rest }) {
  const h = size === 'sm' ? 28 : size === 'lg' ? 40 : 32;
  const v = { primary: { background: 'var(--acc)', color: 'var(--on-acc)', border: 0 }, secondary: { background: 'var(--surf2)', color: 'var(--ink)', border: '1px solid var(--bd)' }, ghost: { background: 'transparent', color: 'var(--ink)', border: 0, textDecoration: 'underline' }, danger: { background: 'var(--st-bad)', color: 'var(--st-on)', border: 0 } }[variant];
  return <button {...rest} style={{ height: h, padding: '0 16px', borderRadius: 999, font: '600 12.5px var(--font)', cursor: 'pointer', transition: 'transform .16s, filter .16s', ...v, ...rest.style }}>{children}</button>;
}
