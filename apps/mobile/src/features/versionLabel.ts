/**
 * The line in every screen's header: «GoRix v1.0.0 · 1448 · 11/15/2026 7:20 AM» (#1506, founder 14.11.2026: «видно, какое последнее
 * обновление»). The moment shown is the newest the running code knows: the update the phone took over the air (`updatedAt`), else
 * the moment the build was made (`builtAt`: the web build, a native build before its first update). No moment at all (a local
 * build) — no date, and the number reads «dev».
 */
export type VersionParts = {
  app: string;
  version: string;
  /** the number written by the build (0 on a local build) */
  build: number;
  /** when the running over-the-air update was published (ISO), or null */
  updatedAt: string | null;
  /** when the build was made (ISO, written by the build), or "" */
  builtAt: string;
};

/** the moment to show and where it came from */
export function versionMoment(p: Pick<VersionParts, "updatedAt" | "builtAt">): { at: string; from: "update" | "build" } | null {
  if (p.updatedAt) return { at: p.updatedAt, from: "update" };
  if (p.builtAt) return { at: p.builtAt, from: "build" };
  return null;
}

export function versionLabel(p: VersionParts, fmt: { day: (iso: string) => string; time: (iso: string) => string }): string {
  const m = versionMoment(p);
  return `${p.app} v${p.version} · ${p.build || "dev"}${m ? ` · ${fmt.day(m.at)} ${fmt.time(m.at)}` : ""}`;
}
