import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { Easing, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import { component, motion, radius, rhythm, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton } from "./controls";
import { Icon, Press, T } from "./primitives";
import { foldMotion, loadPhase, mainStepLayout, shrinkFloor, stackedBar, totalNeed, type FoldFrom } from "./mainStepRules";
import { fitScale } from "./templates/headerMath";
import { useFontScale } from "./fontScale";
import type { MainAction } from "./templates/types";

/** «Итого ˅ $1,240.00» on the left of the bar: it opens the tax and the deposit (the screen's sheet or its Collapsible) */
export interface MainStepTotal {
  label: string;
  value: string;
  onPress?: () => void;
  open?: boolean;
  testID?: string;
  /** visual v2 №5: a quiet word after the sum, 12 `mut` («налог $14.52») */
  sub?: string;
}

/**
 * The main step of an object or an editor (BUILD-SPEC §1 MainStepBar; BUILD-PLAN §1 поток Б; LAYOUT-RULES П3 as of 21.11, #2350).
 * `placement="bar"` — the pinned bottom of an EDITOR only (the screen's `footer`): ONE compact row, at most 56 with its padding —
 * on the left «Итого ˅» 13 and the sum 22 (`total`), else the reason 13 `mut` (why the step is held), else the second step
 * (outlined, by its words); on the right the main button 40 by its words (`acc`/`onAcc`), never across the width. A second step that
 * does not stand there (with a total or a reason, or a label longer than `pair.labelMax`) is not drawn — the screen puts it into «⋯»
 * (`mainStepLayout().secondInMore`). `outline` (or `main.outline`) — the main one outlined when the step is not about selling.
 * `placement="top"` — in the content (an object: right under its header and quick actions): the button 40, the reason under it;
 * `fit` — the button by its words on the left line (an object), else across the column.
 * Loading (`loading`): nothing for `spinnerDelayMs`, then a spinner by the reason, after `actionTimeoutMs` the reason reads `failedLabel`.
 * Disabled (`main.disabled`) — the reason says why. testIDs: `main.testID`, `second.testID`, `total.testID`, `<main.testID>-reason`,
 * `<main.testID>-bar`.
 */
export function MainStep({
  main,
  placement,
  second,
  total,
  outline,
  fit,
  loading,
  failedLabel,
  folded,
  onUnfold,
  foldAdd,
  aside,
  testIDBase,
}: {
  main: MainAction;
  placement: "top" | "bar";
  second?: MainAction | null;
  total?: MainStepTotal | null;
  outline?: boolean;
  /** `top`: the button by its words on the left line, not across the column (an object) */
  fit?: boolean;
  loading?: boolean;
  /** what the reason reads once a loading step took longer than `actionTimeoutMs` («Не получилось») */
  failedLabel?: string;
  /** #2363 q72 (founder 21.11, вариант А): `bar` with a `total`, scrolled down — only the capsule «˄ $772.36» on the right
   *  (a secondary Button, under the thumb, the prices on the left stay seen); a tap opens the bar again (`onUnfold`) */
  folded?: boolean;
  onUnfold?: () => void;
  /** #2363 q72 вариант Г (founder 21.11): beside the capsule a round «＋» — a new line from anywhere in a long list */
  foldAdd?: { a11y: string; onPress: () => void; testID?: string };
  /** #2381 (founder 21.11: «внизу „Готово“. И „Отменить“»): a quiet way back BEFORE the main button in the bar with the total —
   *  `ghost` by its words («Отменить»); the total keeps its place on the left. Only when there is something to take back.
   *  #2935 (founder 27.11, «как у Джобер»): with `outline` it is the second step beside the main one — «Готово» (`secondary`) by «Отправить» */
  aside?: MainAction | null;
  /** #2935: the bar's own ids (`<base>-bar`, `<base>-capsule`, `<base>-reason`) when the main one changes but the bar stays the
   *  same place (the estimate: «Отправить» became the main one, the bar is still `ue-save-bar`); default — `main.testID` */
  testIDBase?: string;
}) {
  const { c } = useTheme();
  const phase = useLoadPhase(!!loading);
  const base = testIDBase ?? main.testID;
  // review 27.11 (#2935): «Итого · налог» and the sum must never be cut. The bar is one row while the total's own width (its caption
  // line, the sum at `shrinkFloor`) stands beside the buttons; when it does not (390 with «Готово · Отправить изменения», a long sum)
  // the total takes its own line over the buttons (`stackedBar`, measured, not guessed by the words' length)
  const [room, setRoom] = useState({ row: 0, right: 0, need: 0 });
  const { layout } = mainStepLayout({ second, total, reason: placement === "bar" ? main.reason : undefined });
  // #2405: the bar's fold moves (the capsule in, the card back up) only where it can fold; reduced motion — a cut
  const reduce = useReducedMotion();
  // (not at the screen's first drawing: the bar is simply there — only a fold or an unfold moves)
  const firstDraw = useRef(true);
  useEffect(() => {
    firstDraw.current = false;
  }, []);
  const fold = placement === "bar" && total && onUnfold && !firstDraw.current ? foldMotion(!!reduce) : null;
  const reasonText = phase === "failed" ? failedLabel : main.reason;
  const reason =
    reasonText || phase === "spinner" ? (
      <View testID={`${base}-reason`} style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: placement === "top" ? component.mainStep.reasonGap : 0 }}>
        {phase === "spinner" ? <ActivityIndicator color={c.mut} /> : null}
        {reasonText ? (
          <T v="caption" tone="mut" numberOfLines={placement === "bar" ? 2 : 1} style={{ flexShrink: 1 }}>
            {reasonText}
          </T>
        ) : null}
      </View>
    ) : null;
  // Ж2: two lines stick for the life of the bar (the editor) — no jumping between one line and two while a price is typed
  const stuck = useRef(false);
  const stacked = placement === "bar" && layout === "total" && stackedBar(room, stuck.current);
  if (stacked) stuck.current = true;
  const byWords = placement === "bar" || fit;
  // М1 (round 2): in the two-line bar the main one takes the row's remaining width, «Готово» keeps its words' width
  const stackedMain = stacked;
  const button = (
    <Button
      testID={main.testID}
      label={main.label}
      accessibilityLabel={main.a11y}
      onPress={main.onPress}
      disabled={main.disabled || phase === "spinner" || phase === "wait"}
      variant={outline || main.outline ? "secondary" : "primary"}
      full={!byWords}
      grow={stackedMain}
    />
  );
  if (placement === "top")
    return (
      <View style={fit ? { alignSelf: "flex-start", maxWidth: "100%" } : undefined}>
        {button}
        {reason}
      </View>
    );
  // a stacked bar is taller than the capsule: it does not fold (the page's end would move under the finger)
  if (placement === "bar" && folded && total && onUnfold && !stacked)
    return (
      // the SAME height as the open card (`figureRow.h`): the bar never changes its height — the page's end and the drag's edge stay put
      // #2405: it slides in from the right growing a little (foldMotion), the card it replaces fades out — never a jump
      <Animated.View entering={fold ? enter(fold.capsule.from, fold.capsule.ms) : undefined} exiting={fold ? FadeOut.duration(fold.outMs) : undefined} style={{ paddingBottom: rhythm.cardGap, height: component.figureRow.h + rhythm.cardGap, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: space[2] }}>
        {foldAdd ? <IconButton icon="plus" label={foldAdd.a11y} onPress={foldAdd.onPress} testID={foldAdd.testID} /> : null}
        {/* rule 29: the capsule is the Button itself (secondary 40, zone 44) — the sum and «˄» */}
        <Button testID={`${base}-capsule`} label={total.value} icon="chevronUp" variant="secondary" onPress={onUnfold} accessibilityLabel={`${total.label} ${total.value}`} />
      </Animated.View>
    );
  let left: ReactNode = reason;
  if (layout === "pair" && second) left = <Button testID={second.testID} label={second.label} onPress={second.onPress} disabled={second.disabled} variant="secondary" />;
  if (layout === "total" && total) left = <TotalPart total={total} onNeed={(need) => setRoom((f) => (f.need === need ? f : { ...f, need }))} />;
  // visual v2 «Редактор» (макет 5, образец №5 «Approximate amount 640 · Schedule»): the bottom is a card `figureRow.h` 64, radius 22,
  // 16 from the sides (the Screen's footer) and `cardGap` 8 over the bottom zone, on the cell `surf2` with the card's shadow — what the step
  // is about on the left, the button 40 by its words on the right
  return (
    // (the Screen's footer already stands `rhythm.screen` from the sides); #2405: back from the capsule it comes up with its fade
    <Animated.View entering={fold ? enter(fold.card.from, fold.card.ms) : undefined} exiting={fold ? FadeOut.duration(fold.outMs) : undefined} style={{ paddingBottom: rhythm.cardGap }}>
      <View
        testID={`${base}-bar`}
        style={{
          minHeight: component.figureRow.h,
          borderRadius: radius.card,
          backgroundColor: c.surf2,
          borderTopWidth: component.hairline,
          borderTopColor: c.hl,
          paddingLeft: space[4],
          paddingRight: space[3],
          justifyContent: "center",
          shadowColor: c.shadow.color,
          shadowOpacity: c.shadow.opacity,
          shadowRadius: c.shadow.radius,
          shadowOffset: { width: 0, height: c.shadow.offsetY },
          elevation: component.shadowSm.elevation,
        }}
      >
        <View
          onLayout={(e) => { const row = Math.round(e.nativeEvent.layout.width); setRoom((f) => (f.row === row ? f : { ...f, row })); }}
          style={stacked ? { gap: space[2], paddingVertical: space[3] } : { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: component.button.phone }}
        >
          <View style={stacked ? { alignItems: "flex-start" } : { flex: 1, minWidth: 0, alignItems: "flex-start" }}>{left}</View>
          <View
            onLayout={(e) => { const right = Math.round(e.nativeEvent.layout.width); setRoom((f) => (f.right === right ? f : { ...f, right })); }}
            style={{ flexDirection: "row", alignItems: "center", gap: space[3], flexShrink: 0, alignSelf: stacked ? "stretch" : undefined }}
          >
            {/* #2935: an `outline` aside is the second step beside the main one («Готово» by «Отправить») — `outline` (a `secondary` is the bar's own `surf2`); else a quiet `ghost` («Отменить») */}
            {aside ? <Button testID={aside.testID} label={aside.label} onPress={aside.onPress} disabled={aside.disabled} variant={aside.outline ? "outline" : "ghost"} /> : null}
            {button}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/** #2405: a fold's entering — from `from` (a little away, a little smaller, transparent) to its place, easeOut */
function enter(from: FoldFrom, ms: number) {
  const t0 = [{ translateX: from.x ?? 0 }, { translateY: from.y ?? 0 }, { scale: from.scale }];
  return new Keyframe({
    0: { opacity: from.opacity, transform: t0 },
    100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }], easing: Easing.out(Easing.cubic) },
  }).duration(ms);
}

function TotalPart({ total, onNeed }: { total: MainStepTotal; onNeed?: (need: number) => void }) {
  const { c } = useTheme();
  // review 27.11 (#2935: «налог ˎ» was cut on 390 once «Готово · Отправить» stood beside it): the tax goes onto the caption line —
  // «Итого · налог $14.52», one line; the sum alone under it, shrunk to its room down to `shrinkFloor` — neither is ever cut: the
  // width they need (`onNeed`) tells the bar when to give the total its own line
  const [cap, setCap] = useState(0);
  const [sum, setSum] = useState(0);
  const chevron = total.onPress ? size.iconSm + space[1] : 0;
  useEffect(() => {
    if (cap > 0 && sum > 0) onNeed?.(totalNeed(cap + chevron, sum));
  }, [cap, sum, chevron, onNeed]);
  const body = (
    <View style={{ justifyContent: "center", maxWidth: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], maxWidth: "100%" }}>
        <FitText v="caption" tone="mut" text={total.sub ? `${total.label} · ${total.sub}` : total.label} floor={1} onNat={setCap} testID={total.testID ? `${total.testID}-caption` : undefined} />
        {total.onPress ? <Icon name={total.open ? "chevronUp" : "chevronDown"} s={size.iconSm} color={c.mut} /> : null}
      </View>
      <FitText v="title" text={total.value} floor={shrinkFloor()} onNat={setSum} testID={total.testID ? `${total.testID}-sum` : undefined} />
    </View>
  );
  if (!total.onPress) return <View testID={total.testID} style={{ maxWidth: "100%" }}>{body}</View>;
  return (
    <Press testID={total.testID} onPress={total.onPress} accessibilityRole="button" accessibilityLabel={`${total.label} ${total.value}`} accessibilityState={{ expanded: !!total.open }} aria-expanded={!!total.open}>
      {body}
    </Press>
  );
}

/**
 * One line, the same on every platform (as `FitTitle`; no `adjustsFontSizeToFit` — the web has none): its natural width is measured
 * once (`onNat`), then it is drawn scaled from its left into the room it has, down to `floor` (the sum: 22 → 18; the caption: 1).
 */
function FitText({ v, tone, text, floor, testID, onNat }: { v: "title" | "caption"; tone?: "mut"; text: string; floor: number; testID?: string; onNat?: (w: number) => void }) {
  const [nat, setNat] = useState(0);
  const [room, setRoom] = useState(0);
  const fontScale = useFontScale();
  useEffect(() => setNat(0), [text, fontScale]);
  const s = fitScale(nat, room, floor);
  const measuring = nat <= 0;
  return (
    // #3004: the measuring layer (ten thousand wide) is clipped here, or the page scrolls sideways (the editor's «Итого · налог» on 390)
    <View testID={testID} onLayout={(e) => setRoom(e.nativeEvent.layout.width)} style={{ flexShrink: 1, minWidth: 0, width: measuring ? undefined : nat, maxWidth: "100%", overflow: "hidden" }}>
      {/* the line's height (a space: no second copy of the words for the tests and the screen reader) */}
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity: 0 }}>
        <T v={v}> </T>
      </View>
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, alignItems: "flex-start", width: measuring ? 10000 : s < 1 ? room / s : 10000, transform: [{ scale: s }], transformOrigin: "left center" }}
      >
        <View
          onLayout={measuring ? (e) => { const w = Math.ceil(e.nativeEvent.layout.width) + 1; setNat(w); onNat?.(w); } : undefined}
          style={{ maxWidth: "100%" }}
        >
          <T v={v} tone={tone} numberOfLines={1} tabular>
            {text}
          </T>
        </View>
      </View>
    </View>
  );
}

/** the loading phase as time goes (`loadPhase`): ticks at the spinner's delay and at the timeout, nothing else */
function useLoadPhase(loading: boolean) {
  const [since, setSince] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!loading) {
      setSince(null);
      return;
    }
    setSince(Date.now());
    const a = setTimeout(() => tick((n) => n + 1), motion.spinnerDelayMs);
    const b = setTimeout(() => tick((n) => n + 1), motion.actionTimeoutMs);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [loading]);
  return loadPhase(loading, since === null ? 0 : Date.now() - since);
}
