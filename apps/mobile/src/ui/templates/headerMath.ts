/**
 * The one header's motion, pure (docs/design/visual-v2.html «Сворачивающаяся шапка»; rule 27а — the math is tested, the phone is
 * not a browser). The scroll leads, not a timer: every look below is a function of the page's scroll `y` alone, so a finger that
 * stops halfway holds the header halfway, and a bounce above 0 is the open header. Only transform and opacity (LAYOUT-RULES §8 п.5).
 *
 * Root of a tab (0–64): the 13 line fades 0–24; the 30 title shrinks to `foldScale` on 16–64 and fades on 40–64; the small title in
 * the row comes in on 40–64 (and slides 8 → 0); the row's plate + line fade in on 48–64; the avatar 40 → 36. Folded from 64.
 * Object (0–112): the quick actions fade 0–48 and go up 12; the two lines right of the rule fade 32–72; the name shrinks 56–112 and
 * fades 80–112 while the small one comes in; the parent's word fades 56–80; the plate 96–112; «＋» leaves the row 96–112 (into «⋯»).
 * Let go between the ends: the nearer end (the half 32 / 56), `durBase` easeOut; a fling down folds at once. Reduce Motion: no shift
 * and no scale — at the half the big block and the small title swap by a fade (`durFast`).
 */
import { component } from "@octo/design-tokens";

export type HeaderKind = "root" | "object" | "editor";

const H = component.header;

/** 0 … 1 along a … b (clamped; a ≥ b — a step at a) */
export function ramp(y: number, a: number, b: number): number {
  "worklet";
  if (b <= a) return y >= a ? 1 : 0;
  if (!(y > a)) return 0;
  if (y >= b) return 1;
  return (y - a) / (b - a);
}

const lerp = (from: number, to: number, p: number) => {
  "worklet";
  return from + (to - from) * p;
};

/** where the header is folded (pt of scroll); an editor never folds */
export function foldEnd(kind: HeaderKind): number {
  "worklet";
  return kind === "root" ? H.root.end : kind === "object" ? H.object.end : 0;
}

/** the half of the way: let go before it — the header opens, past it — it folds; Reduce Motion swaps here */
export function foldHalf(kind: HeaderKind): number {
  "worklet";
  return foldEnd(kind) / 2;
}

/** what every part of the header looks like at a scroll `y` */
export interface HeaderFrame {
  /** the 13 line over the title (the date, «Демо») / the parent's word next to «←» */
  kick: number;
  /** the big title: opacity, scale (from its left top), lift (pt up, on top of the scroll's own) */
  title: number;
  titleScale: number;
  /** the two lines right of the rule (an object) */
  sub: number;
  /** quick actions, the address line (an object): opacity and the shift up */
  actions: number;
  actionsY: number;
  /** the small title in the row: opacity and its slide (8 → 0) */
  mini: number;
  miniY: number;
  /** the row's ground (`ov`) and line */
  plate: number;
  /** «＋» in the row (an object folds it into «⋯») */
  plus: number;
  /** the «Демо» dot on the avatar / at «←» once the plate with the word is gone */
  demoDot: number;
  /** the root avatar 40 → 36 */
  avatarScale: number;
}

const OPEN: HeaderFrame = { kick: 1, title: 1, titleScale: 1, sub: 1, actions: 1, actionsY: 0, mini: 0, miniY: H.root.miniShift, plate: 0, plus: 1, demoDot: 0, avatarScale: 1 };

/**
 * The look at scroll `y`. `reduce` (Reduce Motion): the parts are only 0 or 1 by the half — the caller fades between them in
 * `durFast` — and nothing moves or scales.
 */
export function headerFrame(kind: HeaderKind, y: number, reduce = false): HeaderFrame {
  "worklet";
  if (kind === "editor") {
    // one line, never folds: the plate only says the page went under it
    const plate = reduce ? (y > 0 ? 1 : 0) : ramp(y, 0, H.bar / 4);
    return { ...OPEN, kick: 1, mini: 1, miniY: 0, plate, plus: 1 };
  }
  if (reduce) {
    const past = y >= foldHalf(kind) ? 1 : 0;
    const off = 1 - past;
    return { kick: off, title: off, titleScale: 1, sub: off, actions: off, actionsY: 0, mini: past, miniY: 0, plate: past, plus: kind === "object" ? off : 1, demoDot: past, avatarScale: 1 };
  }
  if (kind === "root") {
    const r = H.root;
    const kick = 1 - ramp(y, 0, r.kickEnd);
    const plate = ramp(y, r.plateFrom, r.end);
    return {
      kick,
      title: 1 - ramp(y, r.titleFadeFrom, r.end),
      titleScale: lerp(1, H.foldScale, ramp(y, r.titleFrom, r.end)),
      sub: kick,
      actions: 1,
      actionsY: 0,
      mini: ramp(y, r.miniFrom, r.end),
      miniY: lerp(r.miniShift, 0, ramp(y, r.miniFrom, r.end)),
      plate,
      plus: 1,
      demoDot: 1 - kick,
      avatarScale: lerp(1, H.avatarFold, plate),
    };
  }
  const o = H.object;
  const parent = 1 - ramp(y, o.parentFrom, o.parentEnd);
  const actionsP = ramp(y, 0, o.actionsEnd);
  return {
    kick: parent,
    title: 1 - ramp(y, o.titleFadeFrom, o.end),
    titleScale: lerp(1, H.foldScale, ramp(y, o.titleFrom, o.end)),
    sub: 1 - ramp(y, o.subFrom, o.subEnd),
    actions: 1 - actionsP,
    actionsY: -o.actionsShift * actionsP,
    mini: ramp(y, o.miniFrom, o.end),
    miniY: lerp(o.miniShift, 0, ramp(y, o.miniFrom, o.end)),
    plate: ramp(y, o.plateFrom, o.end),
    plus: 1 - ramp(y, o.plusFrom, o.end),
    demoDot: 1 - parent,
    avatarScale: 1,
  };
}

/**
 * Let go (the finger lifted, or a fling ran out) at `y` with the speed `velocity` (pt/ms, down the page positive): where the page
 * goes — `null` when it stays (at an end, past the header, an editor). Between 0 and the end: the nearer end by the half; a fling down
 * (≥ `header.flick`) folds at once, a fling up opens.
 */
export function settleTarget(kind: HeaderKind, y: number, velocity = 0): number | null {
  "worklet";
  const end = foldEnd(kind);
  if (end <= 0 || !(y > 0) || y >= end) return null;
  if (velocity >= H.flick) return end;
  if (velocity <= -H.flick) return 0;
  return y >= end / 2 ? end : 0;
}

/** the folded stage the row's controls follow (touches, «＋» into «⋯»): 0 open, 1 past the half, 2 folded */
export function foldStage(kind: HeaderKind, y: number): 0 | 1 | 2 {
  "worklet";
  const end = foldEnd(kind);
  if (end <= 0) return 0;
  if (y >= end) return 2;
  return y >= end / 2 ? 1 : 0;
}

/**
 * Reduce Motion: between the open and the folded look by `p` (0 … 1, the caller's fade of `durFast` started at the half) — only the
 * opacities mix; the scale, the slides and the avatar stay as they are (1 / 0) in both looks, so nothing moves.
 */
export function reducedFrame(kind: HeaderKind, p: number): HeaderFrame {
  "worklet";
  const a = headerFrame(kind, 0, true);
  const b = headerFrame(kind, foldEnd(kind), true);
  const q = Math.min(1, Math.max(0, p));
  const m = (x: number, z: number) => {
    "worklet";
    return x + (z - x) * q;
  };
  return {
    kick: m(a.kick, b.kick),
    title: m(a.title, b.title),
    titleScale: 1,
    sub: m(a.sub, b.sub),
    actions: m(a.actions, b.actions),
    actionsY: 0,
    mini: m(a.mini, b.mini),
    miniY: 0,
    plate: m(a.plate, b.plate),
    plus: m(a.plus, b.plus),
    demoDot: m(a.demoDot, b.demoDot),
    avatarScale: 1,
  };
}

/**
 * The sticky strip under the pinned row (v2: the sections strip / the segment stick to the row's bottom): the scroll's own sticking
 * holds a strip at the page's top edge; the row covers the first `off` pt of it. From where the strip meets the row (`top − off`)
 * it goes down as the page goes up, so it stands still right under the row; from `top` on — `off` (the scroll holds it).
 * Not measured yet (`top` 0) or no row — no shift.
 */
export function stickShift(y: number, top: number, off: number): number {
  "worklet";
  if (!(top > 0) || !(off > 0)) return 0;
  return Math.min(off, Math.max(0, y - (top - off)));
}
