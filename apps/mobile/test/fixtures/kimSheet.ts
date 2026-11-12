import type { DrawnRun, Drawing, P } from "../../src/modules/gutters/geometry";

/**
 * The founder's demo measurement «David Kim» (build 1152, 11.11.2026; snapshots docs/specs/img/founder-kim/): one long
 * gutter, a cross one, a 45′ 3″ one, a broken line with a bay (135°) and an outside corner (90°), a separate short one and
 * a small rectangle — all on storey 1, no downspouts. Rebuilt from the snapshots: the lengths are the founder's, the places
 * are read off the canvas (0.313 px/in on the whole-drawing snapshot).
 */
const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const r = (id: string, a: P, b: P, lengthIn?: number): DrawnRun => ({ id, a, b, attrs, ...(lengthIn ? { lengthIn } : {}) });
const ft = (f: number, i = 0) => f * 12 + i;
const at = (p: P, deg: number, len: number): P => [Math.round(p[0] + len * Math.cos((deg * Math.PI) / 180)), Math.round(p[1] + len * Math.sin((deg * Math.PI) / 180))];

// the long one: top (0, 3605) to bottom (0, 0)
const top: P = [0, ft(300, 5)];
// the cross one: 69′ 3⅜″ at 2351 in up, 262 in to the left of the long one
const crossA: P = [-262, 2351];
const crossB: P = [Math.round(-262 + 831.375), 2351];
// the 45′ 3″ one: a vertical right of the long one, its top is the start of the broken line
const v1: P = [204, 3350];
const v0: P = [204, 3350 - ft(45, 3)];
// the broken line: bay 135° at the top of the vertical, then an outside 90°
const q: P = at(v1, 45, ft(3, 3));
const w: P = at(q, -45, ft(25, 7));
// the separate one: 3′ 5″
const s0: P = [330, 2700];
const s1: P = at(s0, 31, ft(3, 5));
// the small rectangle: 3′ 8″ / 1′ 10″ / 3′ 7″ / 1′ 6″
const x0: P = [338, 2632];
const rect = [x0, [x0[0] + ft(3, 8), x0[1]], [x0[0] + ft(3, 8), x0[1] - ft(1, 10)], [x0[0] + 3, x0[1] - ft(1, 10) + 2]] as P[];

export const kim: Drawing = {
  runs: [
    r("k1", top, [0, 0]),
    r("k2", crossA, crossB),
    r("k3", v1, v0),
    r("k4", v1, q),
    r("k5", q, w),
    r("k6", s0, s1),
    r("k7", rect[0]!, rect[1]!),
    r("k8", rect[1]!, rect[2]!),
    r("k9", rect[2]!, [rect[0]![0] + 3, rect[2]![1]]),
    r("k10", [rect[0]![0] + 3, rect[2]![1]], rect[0]!),
  ],
  downspouts: [],
};
