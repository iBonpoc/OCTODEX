/**
 * Is a notification read for this person (Р-8b, migration 20261117569000)? Each person has their own marks
 * (notification_reads). The shared column read_at counts only when the company read it before the split
 * (public.notifications_split_at(), a constant of the migration): nothing read lights up again after the update, and an
 * old build's mark written after the split puts nothing out for the others. A server before the migration (no split):
 * the shared column, as before. Pure — test/noticeRead.test.ts.
 */
export function noticeRead(readAt: string | null | undefined, mine: boolean, splitAt: string | null | undefined): boolean {
  if (mine) return true;
  if (!readAt) return false;
  if (!splitAt) return true;
  const a = Date.parse(readAt);
  const b = Date.parse(splitAt);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}
