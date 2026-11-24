/**
 * The one header (docs/design/visual-v2.html «Единая шапка» + «Сворачивающаяся шапка»; audit 12 §1 — 16 headers → one system):
 * four kinds, the same parts in the same places on every screen.
 *
 * - **root** of a tab (Главная, План, Клиенты, Деньги, Лиды): the row 48 — the avatar 40 with its ring on the left (→ «Ещё»), ≤ 3
 *   circles 40 on the right; the big block 64 under it — a 13/600 line (the date, the «Демо» plate) and the 30/600 title (tracked
 *   −0,02 em, one line: it shrinks to `fitMinScale`, then «…»). Folded (from 64): one line 52 «avatar 36 · small title 17 · icons».
 * - **object** (Клиент, Работа, Выезд, Смета, Счёт, Лид): the row — «←» 40 and the parent's word 15/600 (where it goes back; the
 *   «Демо» plate next to it), «＋» · «⋯» on the right; the big block — the name 30/600 (a client's «⌄» 24 after it) · the rule
 *   1 × 40 · two lines 15/600 and 13/500. Folded (from 112): «← Имя ⌄ · ⋯», «＋» goes into «⋯».
 * - **editor** (смета, форма, событие): one line 52 — «×» 40, the title 17/700 and the state 12/600 («Черновик · сохранено · Демо»)
 *   in the middle, «⋯» 40 on the right. Never folds.
 * - **sheet**: the title 22/700 and «×» 32 (`SheetHead`, overlays.tsx Sheet draws it).
 *
 * The scroll leads (`headerMath.ts`): the Screen keeps the page's scroll in a shared value and hands it down (`HeaderScroll`);
 * every part here reads it on the UI thread — only transform and opacity, no height. The row stands pinned over the page (its
 * plate `ov` + the line fade in as it folds); the big block is the page's first part and goes up with it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { component, motion, pastels, radius, size, space, spaceHalf, statusIcon, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "../controls";
import { HeaderButton } from "../headerIcon";
import { Icon, Press, T, type IconKey } from "../primitives";
import { DemoDot, DemoPlate, useDemo } from "./demoMark";
import { bigClip, fitScale, foldStage, headerFrame, reducedFrame, type HeaderFrame, type HeaderKind } from "./headerMath";

const H = component.header;

/** what a screen tells its header (Screen `head`); without it the Screen works it out from where the screen stands */
export type HeadSpec =
  | {
      kind: "root";
      /** the 13 line over the title: the date («Пт, 20 ноября») */
      kicker?: string;
      /** the small title of the folded row (Главная: «Сегодня, 20 нояб.»); the title by default */
      mini?: string;
      /** the avatar on the left (→ «Ещё»); `null` — none (820/1280: the profile is in the side menu) */
      avatar?: { initials: string; onPress?: () => void; label: string; testID?: string } | null;
      /** the 30 title is a button with «⌄» 24 after it (План: «Ноябрь ⌄» opens the month in place) */
      titlePress?: TitlePress;
      /** on the right of the big block (План: ‹ › 32) */
      trailing?: ReactNode;
    }
  | {
      kind: "object";
      /** right of the rule: 15/600 and 13/500 (or a StatusPill) */
      sub?: { line1?: string; line2?: ReactNode };
      /** a client's «⌄»: the contacts panel (ObjectHeader `details` in place; `panel` over the page from the folded row) */
      expand?: { open: boolean; onToggle: (open: boolean) => void; expandLabel: string; collapseLabel: string; testID?: string; panel?: ReactNode };
    }
  | { kind: "editor"; /** «Черновик · сохранено 8:19» */ state?: string };

export type TitlePress = { open: boolean; label: string; onPress: () => void; testID?: string };

/* ---------- the page's scroll, handed down ---------- */
type Scroll = {
  y: SharedValue<number>;
  fade: SharedValue<number>;
  kind: HeaderKind;
  reduce: boolean;
  /** ≥ 0 — the header is held at this scroll (the contacts panel is open over it: «пока открыта — шапка не меняется») */
  held: SharedValue<number>;
  /** the room under an object's name (what fades out under it, + the gap): the name's hold is never longer */
  room: SharedValue<number>;
  /** the big block is cut at the pinned row's bottom (the row stands over the page) */
  clip: boolean;
  addRoom: (key: string, h: number) => void;
};
const ScrollCtx = createContext<Scroll | null>(null);
const StageCtx = createContext<0 | 1 | 2>(0);

/**
 * The Screen's header scroll: `y` — the page's scroll (a shared value the scroll handler writes on the UI thread). Reduce Motion —
 * `fade` runs 0 ↔ 1 in `durFast` once the page crosses the half. `stage` (0 open · 1 past the half · 2 folded) is the only thing
 * that comes back to JS: the row's touches and «＋» into «⋯» follow it.
 */
export function HeaderScroll({
  y,
  kind,
  reduce,
  held: heldIn,
  clip = false,
  children,
}: {
  y: SharedValue<number>;
  kind: HeaderKind;
  reduce: boolean;
  held?: SharedValue<number>;
  clip?: boolean;
  children: ReactNode;
}) {
  const fade = useSharedValue(0);
  const own = useSharedValue(-1);
  const held = heldIn ?? own;
  const room = useSharedValue<number>(space[3]);
  const rooms = useRef(new Map<string, number>());
  const addRoom = useCallback(
    (key: string, h: number) => {
      if (h > 0) rooms.current.set(key, h);
      else rooms.current.delete(key);
      let sum = space[3];
      rooms.current.forEach((v) => (sum += v));
      room.value = sum;
    },
    [room],
  );
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useAnimatedReaction(
    () => foldStage(kind, held.value >= 0 ? held.value : y.value),
    (now, before) => {
      if (now === before) return;
      runOnJS(setStage)(now);
      if (reduce) fade.value = withTiming(now > 0 ? 1 : 0, { duration: motion.durFast });
    },
    [kind, reduce],
  );
  return (
    <ScrollCtx.Provider value={useMemo(() => ({ y, fade, kind, reduce, held, room, clip, addRoom }), [y, fade, kind, reduce, held, room, clip, addRoom])}>
      <StageCtx.Provider value={stage}>{children}</StageCtx.Provider>
    </ScrollCtx.Provider>
  );
}

/** the word of the row's parent («Клиенты», «Sarah Mitchell»): an object's own parent link that says the same is not drawn twice (П7) */
const ParentCtx = createContext<string | undefined>(undefined);
export const HeaderParent = ParentCtx.Provider;
export const useHeaderParent = () => useContext(ParentCtx);

/** 0 open · 1 past the half · 2 folded — an object's «＋» leaves for «⋯» at 2 */
export const useHeaderStage = () => useContext(StageCtx);

/** the look of the header at the page's scroll now (UI thread); outside a Screen — the open header. `clip` — the scroll the big
 *  block's cut follows (0 when the row does not stand over the page) */
function useLook<S extends object>(pick: (f: HeaderFrame, clip: number) => S, deps: unknown[] = []) {
  const ctx = useContext(ScrollCtx);
  const zero = useSharedValue(0);
  const none = useSharedValue(-1);
  const y = ctx?.y ?? zero;
  const fade = ctx?.fade ?? zero;
  const held = ctx?.held ?? none;
  const room = ctx?.room ?? none;
  const kind = ctx?.kind ?? "root";
  const reduce = !!ctx?.reduce;
  const cut = !!ctx?.clip;
  return useAnimatedStyle(() => {
    const at = held.value >= 0 ? held.value : y.value;
    const f = reduce ? reducedFrame(kind, fade.value) : headerFrame(kind, at, false, kind === "object" ? room.value : undefined);
    return pick(f, cut ? bigClip(at) : 0);
  }, [kind, reduce, cut, ...deps]);
}

/** quick actions, the address line of an object: fade 0–48 and go up 12 (none of it with Reduce Motion but the fade) */
export function HeaderFade({ children, testID }: { children: ReactNode; testID?: string }) {
  const ctx = useContext(ScrollCtx);
  const key = useRef(`f${Math.random()}`).current;
  useEffect(() => () => ctx?.addRoom(key, 0), [ctx, key]);
  const look = useLook((f) => {
    "worklet";
    return { opacity: f.actions, transform: [{ translateY: f.actionsY }] };
  });
  return (
    // what fades here leaves room for the object's name to wait over (its hold, `holdOf`)
    <Animated.View testID={testID} style={look} onLayout={(e) => ctx?.addRoom(key, e.nativeEvent.layout.height)}>
      {children}
    </Animated.View>
  );
}

/* ---------- the row's left: the avatar, «←», «×» ---------- */
export function HeaderAvatar({ initials, onPress, label, testID = "hdr-avatar" }: { initials: string; onPress?: () => void; label: string; testID?: string }) {
  const { c, name } = useTheme();
  const s = H.circle;
  const out = H.avatarRing + H.ringGap;
  // v2 «Корень вкладки»: the avatar 40 on the pastel lavender (palette A), its initials in the pastel's text (≥ 7:1)
  const lav = pastels[name].lav;
  const look = useLook((f) => {
    "worklet";
    return { transform: [{ scale: f.avatarScale }] };
  });
  const dot = useLook((f) => {
    "worklet";
    return { opacity: f.demoDot };
  });
  const body = (
    <Animated.View style={[{ width: s, height: s }, look]}>
      <View pointerEvents="none" style={{ position: "absolute", top: -out, left: -out, right: -out, bottom: -out, borderRadius: radius.pill, borderWidth: H.avatarRing, borderColor: c.acc }} />
      <View style={{ width: s, height: s, borderRadius: radius.pill, backgroundColor: lav.fill, alignItems: "center", justifyContent: "center" }}>
        <T v="caption" w="bold" style={{ color: lav.text }}>
          {initials}
        </T>
      </View>
      <DemoDotAt look={dot} />
    </Animated.View>
  );
  return onPress ? (
    <Press testID={testID} onPress={onPress} visibleHeight={s} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Press>
  ) : (
    <View testID={testID}>{body}</View>
  );
}

/** the folded «Демо» dot on a corner of the left control (its look is the header's `demoDot`) */
function DemoDotAt({ look }: { look: ReturnType<typeof useAnimatedStyle> }) {
  const d = useDemo();
  if (!d.shown) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, right: 0 }, look]}>
      <DemoDot />
    </Animated.View>
  );
}

/** «←» 40 (VoiceOver «Назад: Клиенты»); with the folded «Демо» dot */
export function HeaderBack({ label, onPress, testID = "hdr-back" }: { label: string; onPress: () => void; testID?: string }) {
  const dot = useLook((f) => {
    "worklet";
    return { opacity: f.demoDot };
  });
  return <HeaderButton testID={testID} icon="arrowLeft" label={label} onPress={onPress} dot={<DemoDotAt look={dot} />} />;
}

/** the editor's «×» 40 (it asks first when something is not saved — the screen's `back` does) */
export function HeaderClose({ label, onPress, testID = "hdr-close" }: { label: string; onPress: () => void; testID?: string }) {
  return <HeaderButton testID={testID} icon="close" label={label} onPress={onPress} />;
}

/** a client's «⌄» 24 after the name (and in the folded row) */
function Chevron({ open, label, onPress, testID }: { open: boolean; label: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Press testID={testID} onPress={onPress} visibleHeight={H.chevron} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}>
      {/* the circle 24 on the cell tone (v2 `.chev`); open — «⌃» */}
      <View style={{ width: H.chevron, height: H.chevron, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
        <Icon name={open ? "chevronUp" : "chevronDown"} s={size.iconSm} color={c.ink} />
      </View>
    </Press>
  );
}

/** the «⌄» 24 drawn inside a pressable title (План «Ноябрь ⌄»): the same circle as `Chevron`, not a button of its own */
function ChevronMark({ open }: { open: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ width: H.chevron, height: H.chevron, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
      <Icon name={open ? "chevronUp" : "chevronDown"} s={size.iconSm} color={c.ink} />
    </View>
  );
}

/* ---------- the row ---------- */
/**
 * The pinned row: `bar` 52 (the open row's 48 + the 4 the big block starts under it). Left — `lead`; the middle — an object's
 * parent word with the «Демо» plate (fades 56–80) under the small title (comes in as it folds); an editor's title + state, always;
 * the right — the circles. Its plate (`ov` + the line) fades in as the header folds.
 */
export function HeaderBar({
  kind,
  lead,
  parent,
  mini,
  state,
  chevron,
  right,
  titleRef,
  help,
  testID = "screen-head",
}: {
  kind: HeaderKind;
  lead?: ReactNode;
  /** an object's «Клиенты» next to «←»: what «←» goes back to (a tap goes there too) */
  parent?: { label: string; onPress: () => void };
  /** the small title (17/700) */
  mini: string;
  /** the editor's state line 12/600 («Демо» joins it as a word) */
  state?: string;
  chevron?: { open: boolean; label: string; onPress: () => void };
  right?: ReactNode;
  /** the editor's «?» — right after its title (DS Б7) */
  help?: ReactNode;
  /** the editor's title is the screen's heading (a screen reader starts there) */
  titleRef?: Ref<ComponentRef<typeof View>>;
  testID?: string;
}) {
  const stage = useHeaderStage();
  const demo = useDemo();
  const kick = useLook((f) => {
    "worklet";
    return { opacity: f.kick };
  });
  const miniLook = useLook((f) => {
    "worklet";
    return { opacity: f.mini, transform: [{ translateY: f.miniY }] };
  });
  const editor = kind === "editor";
  const stateLine = [state, demo.shown ? demo.word : null].filter(Boolean).join(" · ");
  return (
    <View testID={testID} style={{ height: H.bar, flexDirection: "row", alignItems: "center", gap: space[2] }}>
      {lead}
      <View style={{ flex: 1, minWidth: 0, height: H.bar, justifyContent: "center" }}>
        {editor ? (
          <View style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], maxWidth: "100%" }}>
              <View ref={titleRef} role="heading" aria-level={1} tabIndex={-1} style={[{ flexShrink: 1 }, noRing]} testID="screen-title">
                <T v="heading" w="bold" numberOfLines={1}>
                  {mini}
                </T>
              </View>
              {help}
            </View>
            {stateLine ? (
              demo.shown ? (
                <Press testID="demo-badge" onPress={demo.go} accessibilityRole="button" accessibilityLabel={demo.label}>
                  <T v="micro" w="semibold" tone="mut" numberOfLines={1}>
                    {stateLine}
                  </T>
                </Press>
              ) : (
                <T v="micro" w="semibold" tone="mut" numberOfLines={1}>
                  {stateLine}
                </T>
              )
            ) : null}
          </View>
        ) : (
          <>
            {parent ? (
              <Animated.View pointerEvents={stage > 0 ? "none" : "box-none"} style={[{ position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: space[2] }, kick]}>
                <Press testID="hdr-parent" onPress={parent.onPress} accessibilityRole="link" accessibilityLabel={parent.label} containerStyle={{ flexShrink: 1 }} style={{ minHeight: size.hitMin, justifyContent: "center" }}>
                  <T v="body" w="semibold" tone="mut" numberOfLines={1}>
                    {parent.label}
                  </T>
                </Press>
                <DemoPlate />
              </Animated.View>
            ) : null}
            <Animated.View
              pointerEvents={stage > 0 ? "box-none" : "none"}
              accessibilityElementsHidden={stage === 0}
              importantForAccessibility={stage === 0 ? "no-hide-descendants" : "auto"}
              style={[{ flexDirection: "row", alignItems: "center", gap: space[2] }, miniLook]}
            >
              <T v="heading" w="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {miniParts(kind, mini)}
              </T>
              {chevron ? <Chevron testID="hdr-bar-expand" open={chevron.open} label={chevron.label} onPress={chevron.onPress} /> : null}
            </Animated.View>
          </>
        )}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

/** a root's small title «Сегодня, 20 нояб.»: what it is in `ink`, the date after the comma `mut` 600 (v2 frame 3) */
function miniParts(kind: HeaderKind, mini: string): ReactNode {
  const at = kind === "root" ? mini.indexOf(", ") : -1;
  if (at <= 0) return mini;
  return (
    <>
      {mini.slice(0, at + 2)}
      <T v="heading" w="semibold" tone="mut">
        {mini.slice(at + 2)}
      </T>
    </>
  );
}

/**
 * The folded row's ground: `ov` with the hairline under it, fading in as the header folds (root 48–64, object 96–112; an editor —
 * as soon as the page goes under it). The Screen lays it behind the pinned row, the whole width.
 */
export function HeaderPlate({ top, testID = "screen-head-plate" }: { top: number; testID?: string }) {
  const { c } = useTheme();
  const look = useLook((f) => {
    "worklet";
    return { opacity: f.plate };
  });
  // v2 «свёрнутая строка»: the screen's ground at 92 % (`header.plateAlpha`) + the hairline; under it a blur, so the 8 % that shows
  // through is a haze, never words of the page that went under the row
  return (
    <Animated.View testID={testID} pointerEvents="none" style={[{ position: "absolute", top, bottom: 0, left: 0, right: 0, overflow: "hidden", borderBottomWidth: component.hairline, borderBottomColor: c.bd }, look]}>
      <BlurView intensity={c.blur * 3} tint={c.blurTint} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.bg, opacity: H.plateAlpha }} />
    </Animated.View>
  );
}

/* ---------- the big block ---------- */
/**
 * The title on one line, the same on every platform (v2: «сжимается до 22,5 по fitMinScale, потом «…»»; no `adjustsFontSizeToFit`):
 * its natural width is measured once in a wide box, then it is drawn scaled by `fitScale` from its left (transform, as the fold's
 * scale) in the room it has; past `font.fitMinScale` it is cut with «…» at that scale. The room the title takes in the line is its
 * scaled width, so the «⌄» and the «?» stand right after it.
 */
export function FitTitle({ text, track }: { text: string; track?: number }) {
  const [nat, setNat] = useState(0);
  const [room, setRoom] = useState(0);
  useEffect(() => setNat(0), [text]);
  const s = fitScale(nat, room);
  const measuring = nat <= 0;
  return (
    <View
      onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
      style={{ flexShrink: 1, minWidth: 0, width: measuring ? undefined : nat, maxWidth: "100%" }}
    >
      {/* the line's height (a space: no second copy of the name for the tests and the screen reader) */}
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity: 0 }}>
        <T v="display" w="semibold">
          {" "}
        </T>
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          alignItems: "flex-start",
          width: measuring ? 10000 : s < 1 ? room / s : 10000,
          transform: [{ scale: s }],
          transformOrigin: "left center",
        }}
      >
        <View onLayout={measuring ? (e) => setNat(Math.ceil(e.nativeEvent.layout.width) + 1) : undefined} style={{ maxWidth: "100%" }}>
          <T v="display" w="semibold" numberOfLines={1} style={{ letterSpacing: track }}>
            {text}
          </T>
        </View>
      </View>
    </View>
  );
}

/**
 * The big block 64 under the row (root, object): it goes up with the page — a root's after its first 16, an object's name after 56
 * (`titleY`, the hold); the title shrinks from its left and fades, the 13 line / the two lines fade first. It is cut at the pinned
 * row's bottom (`bigClip`): the clip window stays at the row's bottom while the block inside goes up, so nothing of it is drawn
 * over «←», the avatar or the small title — it goes UNDER the row (v2 «уезжает под строку»). The title is the screen's heading
 * (`titleRef`, `screen-title`) — one line, `FitTitle`.
 */
export function HeaderBig({
  kind,
  title,
  titleRef,
  kicker,
  sub,
  expand,
  help,
  titlePress,
  trailing,
}: {
  kind: "root" | "object";
  title: string;
  titleRef?: Ref<ComponentRef<typeof View>>;
  kicker?: string;
  titlePress?: TitlePress;
  trailing?: ReactNode;
  sub?: { line1?: string; line2?: ReactNode };
  expand?: { open: boolean; onToggle: (open: boolean) => void; expandLabel: string; collapseLabel: string; testID?: string };
  /** the screen's «?» — right after the title it explains (DS Б7) */
  help?: ReactNode;
}) {
  const { c } = useTheme();
  const demo = useDemo();
  const kickLook = useLook((f) => {
    "worklet";
    return { opacity: f.kick };
  });
  const titleLook = useLook((f) => {
    "worklet";
    return { opacity: f.title, transform: [{ translateX: f.titleX }, { scale: f.titleScale }] };
  });
  const subLook = useLook((f) => {
    "worklet";
    return { opacity: f.sub };
  });
  const trailLook = useLook((f) => {
    "worklet";
    return { opacity: f.title };
  });
  // the clip window goes down as the page goes up (it stays at the row's bottom); the block inside goes up by the same, less its hold
  const windowLook = useLook((_f, clip) => {
    "worklet";
    return { transform: [{ translateY: clip }] };
  });
  const blockLook = useLook((f, clip) => {
    "worklet";
    return { transform: [{ translateY: clip > 0 ? -clip + f.titleY : 0 }] };
  });
  const hold = kind === "root" ? H.root.hold : H.object.hold;
  const titleText = (
    <View ref={titleRef} role="heading" aria-level={1} aria-label={title} tabIndex={-1} style={[{ flexShrink: 1, minWidth: 0 }, noRing]} testID="screen-title">
      <FitTitle text={title} track={H.titleTrack} />
    </View>
  );
  const chevron = expand ? (
    <Chevron
      testID={expand.testID}
      open={expand.open}
      label={expand.open ? expand.collapseLabel : expand.expandLabel}
      onPress={() => expand.onToggle(!expand.open)}
    />
  ) : null;
  const body =
    kind === "root" ? (
      <View style={{ minHeight: H.big, justifyContent: "flex-end", paddingTop: spaceHalf.hair, paddingBottom: space[1] }}>
        {kicker || demo.shown ? (
          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space[2] }, kickLook]}>
            {kicker ? (
              <T v="caption" w="semibold" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
                {kicker}
              </T>
            ) : null}
            <DemoPlate />
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Animated.View style={[{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[2], transformOrigin: "left top" }, titleLook]}>
            {titlePress ? (
              <Press
                testID={titlePress.testID}
                onPress={titlePress.onPress}
                accessibilityRole="button"
                accessibilityLabel={titlePress.label}
                accessibilityState={{ expanded: titlePress.open }}
                containerStyle={{ flexShrink: 1, minWidth: 0 }}
                style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}
              >
                {titleText}
                <ChevronMark open={titlePress.open} />
              </Press>
            ) : (
              titleText
            )}
            {help}
          </Animated.View>
          {trailing ? <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space[2] }, trailLook]}>{trailing}</Animated.View> : null}
        </View>
      </View>
    ) : (
      <View style={{ minHeight: H.big, flexDirection: "row", alignItems: "center", gap: space[3], paddingTop: spaceHalf.hair, paddingBottom: space[1] }}>
        {/* the name keeps its room first (up to two thirds of the line); the two lines take what is left and cut with «…»;
            with no two lines the name has the whole line (e2e 457: «Настройки приложения» was cut at 66 % on 390) */}
        <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 0, maxWidth: sub && (sub.line1 || sub.line2) ? "66%" : "100%", transformOrigin: "left center" }, titleLook]}>
          {titleText}
          {chevron}
          {help}
        </Animated.View>
        {sub && (sub.line1 || sub.line2) ? (
          <Animated.View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[3], minWidth: 0 }, subLook]}>
            {/* v2 `.vb`: the rule 1 × 40 in `off` — it is seen (the hairline `bd` was not: «нет разделения») */}
            <View testID="screen-head-rule" style={{ width: component.hairline, height: H.rule, backgroundColor: c.off }} />
            <View style={{ minWidth: 0, flexShrink: 1, overflow: "hidden", gap: spaceHalf.hair }}>
              {sub.line1 ? (
                <T v="body" w="semibold" numberOfLines={1}>
                  {sub.line1}
                </T>
              ) : null}
              {typeof sub.line2 === "string" ? (
                <T v="caption" w="medium" tone="mut" numberOfLines={1}>
                  {sub.line2}
                </T>
              ) : sub.line2 ? (
                <View style={{ flexDirection: "row", overflow: "hidden" }}>{sub.line2}</View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    );
  // the window is taller than the block by the hold (and as much less below it): the held block is never cut at its own bottom
  return (
    <Animated.View testID="screen-head-big" pointerEvents="box-none" style={[{ overflow: "hidden", paddingBottom: hold, marginBottom: -hold }, windowLook]}>
      <Animated.View pointerEvents="box-none" style={blockLook}>
        {body}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The status as the second line right of the rule (v2 «Клиент · VIP / ◷ Активный»): the status's icon and its word, 13/500 `mut` —
 * no plate (rule 2: an icon and a word, never a colour alone). A tap — the office's StatusPicker.
 */
export function HeadStatus({ status, icon, label, onPress, testID }: { status: StatusName; icon?: IconKey; label: string; onPress?: () => void; testID?: string }) {
  const { c } = useTheme();
  const line = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], minWidth: 0 }}>
      <Icon name={icon ?? statusIcon[status]} s={size.iconXs} color={c.mut} />
      <T v="caption" w="medium" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </T>
    </View>
  );
  return onPress ? (
    <Press testID={testID} onPress={onPress} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={label} containerStyle={{ alignSelf: "flex-start", maxWidth: "100%" }}>
      {line}
    </Press>
  ) : (
    <View testID={testID} accessibilityRole="text" accessibilityLabel={label} style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
      {line}
    </View>
  );
}

/** the title takes focus only so a screen reader starts there — no ring (react-native-web passes outlineStyle through) */
const noRing = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as ViewStyle;

/* ---------- the sheet ---------- */
/**
 * A sheet's head (v2 «Шторка»): the row 52 — the title 22/700 on the left (a 12 line under it), «×» 32 on the right; no «←», no
 * avatar (a sheet with a step back keeps its «‹» before the title). testIDs `sheet-title`, `sheet-close`.
 */
export function SheetHead({ title, sub, onClose, closeLabel, back }: { title?: string; sub?: string; onClose: () => void; closeLabel: string; back?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  const s = H.sheetClose;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: H.sheetRow }}>
      {back ? (
        <Press testID="sheet-back" onPress={back.onPress} visibleHeight={s} accessibilityRole="button" accessibilityLabel={back.label}>
          <View style={{ width: s, height: s, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chevronLeft" s={size.iconSm} color={c.ink} />
          </View>
        </Press>
      ) : null}
      <View testID="sheet-title" style={{ flex: 1, minWidth: 0 }}>
        <T v="title" w="bold" numberOfLines={2}>
          {title ?? ""}
        </T>
        {sub ? (
          <T v="micro" tone="mut" numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      <Press testID="sheet-close" onPress={onClose} visibleHeight={s} accessibilityRole="button" accessibilityLabel={closeLabel}>
        <View style={{ width: s, height: s, borderRadius: radius.pill, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" s={size.iconSm} color={c.ink} />
        </View>
      </Press>
    </View>
  );
}

/** the header held open (the showcase's template frames: the showcase's own scroll must not fold the samples) */
export function HeaderStill({ kind, children }: { kind: HeaderKind; children: ReactNode }) {
  const y = useSharedValue(0);
  return (
    <HeaderScroll y={y} kind={kind} reduce={false}>
      {children}
    </HeaderScroll>
  );
}
