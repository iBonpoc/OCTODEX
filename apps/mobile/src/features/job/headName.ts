/**
 * The job's name in the one header (visual v2 «Bathroom remodel | vanity, toilet, tile», #2350): the big title is the name up to the
 * first «:» (or «, » / « — »), the rest is the line right of the rule — so a long name is not cut to «Bathroom remo…» at 390 and its
 * detail is still said once. A name without a mark stays whole. Pure; tested in test/jobHeadName.test.ts.
 */
export function jobHeadParts(title: string): { name: string; rest?: string } {
  const t = title.trim();
  const m = /^(.+?)(?::\s*|,\s+|\s+—\s+)(.+)$/.exec(t);
  if (!m || m[1]!.trim().length < 3) return { name: t };
  return { name: m[1]!.trim(), rest: m[2]!.trim() };
}
