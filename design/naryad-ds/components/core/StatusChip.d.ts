export interface StatusChipProps {
  /** ok: выполнено, info: в работе, warn: внимание, bad: критично, neutral: черновик */
  status?: 'ok' | 'info' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}
export function StatusChip(props: StatusChipProps): JSX.Element;
