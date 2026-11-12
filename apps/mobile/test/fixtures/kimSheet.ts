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
// the small rectangle (the founder's numbers): top 3′ 8″, right 1′ 10″, bottom 3′ 7″, left 1′ 6″ — the left one stops 4″ short
// of the top, so three corners (bottom-left, bottom-right, top-right) are outside 90° and the fourth is open
const bl: P = [338, 2610];
const br: P = [bl[0] + ft(3, 7), bl[1]];
const tr: P = [br[0], br[1] + ft(1, 10)];
const tl: P = [tr[0] - ft(3, 8), tr[1]];
const left: P = [bl[0], bl[1] + ft(1, 6)];

export const kim: Drawing = {
  runs: [
    r("k1", top, [0, 0]),
    r("k2", crossA, crossB),
    r("k3", v1, v0),
    r("k4", v1, q),
    r("k5", q, w),
    r("k6", s0, s1),
    r("k7", tr, tl),
    r("k8", br, tr),
    r("k9", br, bl),
    r("k10", bl, left),
  ],
  downspouts: [],
};
