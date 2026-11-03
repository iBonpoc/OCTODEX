export function Card({ children, style, ...rest }) {
  return <div {...rest} style={{ background: 'var(--surf)', border: '1px solid var(--bd)', backdropFilter: 'blur(var(--blur))', borderRadius: 'var(--r)', padding: 16, boxShadow: 'var(--sh)', backgroundImage: 'var(--grain)', ...style }}>{children}</div>;
}
