export function Toggle({ on, onChange }) {
  return <button role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ width: 42, height: 24, borderRadius: 99, border: '1px solid var(--bd)', background: on ? 'var(--acc)' : 'var(--track)', position: 'relative', padding: 0, cursor: 'pointer', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: on ? 'var(--on-acc)' : 'var(--ink)', transition: 'left .25s cubic-bezier(.3,1.4,.5,1)' }} /></button>;
}
