import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { GestureDetector, GestureStateManager, State, usePanGesture } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { component, motion, radius, size, space, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, IconButton, StatusChip } from "./controls";
import { MetaLine } from "./metaLine";
import { ButtonPair } from "./pairs";
import { Press, T } from "./primitives";
import { IconRow, type IconRowItem } from "./iconRow";
import { HeaderFade, useHeaderParent } from "./templates/screenHeader";
import { compactProgress, expandEndsOpen, expandShown, expandSwipeStart, followFrom, isCompact, panelMotion, type ExpandRule } from "./objectHeaderMath";

/** a tag of the meta line («VIP», «Regular»): drawn as `MetaTag`, the ones that do not fit go into «+N» (MetaLine) */
export type MetaPart = { id: string; label: string };

export interface ObjectHeaderLabels {
  /** «Раскрыть» — the «⌄» button and the compact bar's «⌄» */
  expand: string;
  /** «Свернуть» — the «⌄» when open and the panel's bottom button */
  collapse: string;
  /** «ещё 2» — what MetaLine's «+N» reads */
  more: (n: number) => string;
  /** «Изменить» — the panel's «✎» button (with `onEdit`) */
  edit?: string;
}

export interface ObjectHeaderProps {
  /** the name — once on the screen (П7) */
  title: string;
  /** the tags after the status: «VIP · Regular» */
  meta?: MetaPart[];
  /** the sum at the end of the meta line («$1,840») */
  amount?: string;
  /** StatusPill; `onPress` — the office's StatusPicker */
  status?: { name: StatusName; label: string; onPress?: () => void };
  /** the address line 13 `accText` «›» — opens the route in the platform's maps (#2353); hidden while the panel is open */
  address?: { text: string; onPress: () => void };
  /** «Клиент ›» — the parent object */
  link?: { label: string; onPress: () => void };
  /** initials (36, `avatar.md`) */
  avatar?: string;
  /** QuickActions `inline` at the end of the address line: «Позвонить», «SMS» (≤ 2) */
  actions?: IconRowItem[];
  /** the panel under the header: «Контакты · N», «Адреса · N», «Сведения» (Collapsible / ListRow of the screen) */
  details?: ReactNode;
  onEdit?: () => void;
  /** controlled: open + onToggle; else the header keeps its own state */
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  labels: ObjectHeaderLabels;
  /**
   * The one header draws the name (templates/screenHeader.tsx, v2 «Объект»: «Имя | две строки», the «⌄» after it): here only what
   * stands under it — the parent link and the address line (they fade 0–48 as the page goes up) and the panel. ObjectScreen sets it.
   */
  inHead?: boolean;
  testID: string;
}

/**
 * The object's lines for the one header's big block (v2 «Объект»): right of the rule — the tags and the sum 15/600, under them the
 * StatusPill (the office's StatusPicker on a tap). testIDs `<testID>-status`, `<testID>-meta`.
 */
export function objectHeadSub(p: ObjectHeaderProps): { line1?: string; line2?: ReactNode } {
  const id = (part: string) => `${p.testID}-${part}`;
  const line1 = [...(p.meta ?? []).map((m) => m.label), p.amount].filter(Boolean).join(" · ") || undefined;
  const line2 = p.status ? (
    p.status.onPress ? (
      <Press testID={id("status")} onPress={p.status.onPress} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={p.status.label} containerStyle={{ alignSelf: "flex-start" }}>
        <StatusChip status={p.status.name} label={p.status.label} />
      </Press>
    ) : (
      <View testID={id("status")} style={{ alignSelf: "flex-start" }}>
        <StatusChip status={p.status.name} label={p.status.label} />
      </View>
    )
  ) : undefined;
  return { line1, line2 };
}

const releaseRule: ExpandRule = {
  settle: component.sheetDismissRatio,
  project: component.sheetProjectMs,
  slow: component.sheetSlowVelocity,
  flick: component.sheetFlickVelocity,
};

/**
 * The object's header (BUILD-SPEC §1 ObjectHeader, client-card.html): who it is and what is with it now.
 * Shut (by default, ≤ `objectHeader.maxH` 104 without the status bar): initials 36 · the name 22 semibold, under it MetaLine
 * «StatusPill · tags · sum», on the right «⌄» (zone 44); the address line 13 `accText` «›» with QuickActions `inline` on the right.
 * Open (by «⌄» or a swipe down on the header): the panel `surf` slides out from under it with a fade (`durBase`, `easeOut`; only
 * transform and opacity — the content below takes the panel's place at once, no height is animated; Reduce Motion — the fade only)
 * with `details` and, at its bottom, «✎ Изменить» · «⌃ Свернуть»; the address line is hidden then. A swipe up on the header shuts it.
 * The swipe follows the finger and lets go by the sheet's rule (`objectHeaderMath.ts`, rule 27а). The compact bar «‹ Имя ⌄ ⋯» that
 * comes in on scroll is `ObjectHeaderBar` (the screen puts it in its header row). The nav row «‹ ＋ ⋯» is the Screen's.
 * testIDs: `<testID>`, `-toggle`, `-status`, `-address`, `-link`, `-panel`, `-edit`, `-collapse`, `-meta`.
 */
export function ObjectHeader(p: ObjectHeaderProps) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [own, setOwn] = useState(!!p.defaultOpen);
  const open = p.open ?? own;
  const openRef = useRef(open);
  openRef.current = open;
  const setOpen = (next: boolean) => {
    if (next === openRef.current) return;
    if (p.open === undefined) setOwn(next);
    p.onToggle?.(next);
  };
  const id = (part: string) => `${p.testID}-${part}`;
  // the row's «← Sarah Mitchell» already says the parent: its link here would say it a second time (П7, audit 12 «Работа»)
  const parent = useHeaderParent();
  const link = p.link && !(p.inHead && parent && p.link.label.trim() === parent.trim()) ? p.link : undefined;

  // the panel: its natural height is measured where it lies (absolutely, under a clip of 0, while shut); `shown` is how far it is
  // out. Only transform and opacity move (LAYOUT-RULES §8 п.5): open, it stands in the flow at its full height and slides out from
  // under the header with a fade (`panelMotion`); the content below takes its place at once — no height is animated.
  const [panelH, setPanelH] = useState(0);
  const [inFlow, setInFlow] = useState(open);
  const shown = useSharedValue(0);
  const dragging = useRef(false);
  const ease = Easing.bezier(...motion.easeOut);
  const settle = (to: boolean) => {
    if (to) setInFlow(true);
    shown.value = withTiming(to ? panelH : 0, { duration: motion.durBase, easing: ease }, (done) => {
      if (done && !to) runOnJS(setInFlow)(false);
    });
  };
  useEffect(() => {
    if (dragging.current) return;
    settle(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelH]);
  const look = useAnimatedStyle(() => {
    const m = panelMotion(shown.value, panelH, reduce);
    return { opacity: m.opacity, transform: [{ translateY: m.translateY }] };
  }, [panelH, reduce]);

  // the swipe on the header: down opens, up shuts; the page's scroll keeps the other direction
  const touchAt = useRef<[number, number] | null>(null);
  const base = useRef(0);
  const pan = usePanGesture({
    runOnJS: true,
    manualActivation: true,
    onTouchesDown: (e) => {
      const t0 = e.allTouches[0];
      touchAt.current = t0 ? [t0.absoluteX, t0.absoluteY] : null;
    },
    onTouchesMove: (e) => {
      const t0 = e.allTouches[0];
      if (!t0 || !touchAt.current || e.state === State.ACTIVE) return;
      const go = expandSwipeStart(t0.absoluteX - touchAt.current[0], t0.absoluteY - touchAt.current[1], component.sheetBodySlop, openRef.current);
      if (go === "activate") GestureStateManager.activate(e.handlerTag);
      else if (go === "fail") GestureStateManager.fail(e.handlerTag);
    },
    onActivate: (e) => {
      dragging.current = true;
      base.current = e.translationY;
      setInFlow(true);
    },
    onUpdate: (e) => {
      shown.value = expandShown(openRef.current, followFrom(base.current, e.translationY), panelH);
    },
    onDeactivate: (e) => {
      const travel = followFrom(base.current, e.translationY);
      // Gesture Handler counts pt per second, the rule pt per ms
      const next = expandEndsOpen(openRef.current, travel, e.velocityY / 1000, panelH, releaseRule);
      dragging.current = false;
      settle(next);
      setOpen(next);
    },
  });

  const statusChip = p.status ? (
    p.status.onPress ? (
      <Press key="status" testID={id("status")} onPress={p.status.onPress} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={p.status.label}>
        <StatusChip status={p.status.name} label={p.status.label} />
      </Press>
    ) : (
      <View key="status" testID={id("status")}>
        <StatusChip status={p.status.name} label={p.status.label} />
      </View>
    )
  ) : null;
  const fixed = [
    statusChip,
    p.amount ? (
      <T key="amount" v="caption" tone="mut" tabular numberOfLines={1}>
        {p.amount}
      </T>
    ) : null,
  ].filter(Boolean) as ReactNode[];
  const meta = p.meta ?? [];

  return (
    <GestureDetector gesture={pan}>
      <View testID={p.testID} style={{ gap: space[2] }}>
        {p.inHead ? null : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          {p.avatar ? <Avatar initials={p.avatar} s={component.avatar.md} /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
            <T v="title" numberOfLines={1}>
              {p.title}
            </T>
            {fixed.length || meta.length ? (
              <MetaLine testID={id("meta")} fixed={fixed} tags={meta} tagsLabel={meta.map((x) => x.label).join(", ")} moreLabel={p.labels.more} />
            ) : null}
          </View>
          <IconButton bare testID={id("toggle")} icon={open ? "chevronUp" : "chevronDown"} label={open ? p.labels.collapse : p.labels.expand} onPress={() => setOpen(!open)} />
        </View>
        )}
        <HeaderFade>
        {link ? (
          <Press testID={id("link")} onPress={link.onPress} accessibilityRole="link" accessibilityLabel={link.label} style={{ alignSelf: "flex-start", minHeight: size.hitMin, justifyContent: "center" }}>
            <T v="caption" w="semibold" numberOfLines={1} style={{ color: c.accText }}>
              {`${link.label} ›`}
            </T>
          </Press>
        ) : null}
        {!open && (p.address || p.actions?.length) ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.hitMin }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {p.address ? (
                <Press testID={id("address")} onPress={p.address.onPress} accessibilityRole="link" accessibilityLabel={p.address.text} style={{ minHeight: size.hitMin, justifyContent: "center" }}>
                  <T v="caption" numberOfLines={1} style={{ color: c.accText }}>
                    {`${p.address.text} ›`}
                  </T>
                </Press>
              ) : null}
            </View>
            {p.actions?.length ? <IconRow variant="inline" actions={p.actions} testID={id("actions")} /> : null}
          </View>
        ) : null}
        </HeaderFade>
        <View
          style={inFlow ? { overflow: "hidden" } : { height: 0, overflow: "hidden" }}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        >
          <Animated.View
            testID={id("panel")}
            onLayout={(e) => setPanelH(Math.ceil(e.nativeEvent.layout.height))}
            pointerEvents={open ? "auto" : "none"}
            style={[inFlow ? null : { position: "absolute", top: 0, left: 0, right: 0 }, look]}
          >
            <View style={{ backgroundColor: c.surf, borderRadius: radius.card, padding: space[4], gap: space[3] }}>
              {p.details}
              <ButtonPair
                main={{ testID: id("collapse"), label: p.labels.collapse, icon: "chevronUp", variant: "secondary", onPress: () => setOpen(false) }}
                second={p.onEdit && p.labels.edit ? { testID: id("edit"), label: p.labels.edit, icon: "pencil", variant: "secondary", onPress: p.onEdit } : null}
              />
            </View>
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

/**
 * The compact header on scroll (BUILD-SPEC §1 «сжатый», client-card.html (в)): one row 44 «‹ Имя ⌄ ⋯» — `back` «‹» on the left, the
 * name 17 semibold and «⌄» in the middle (the screen scrolls up and opens the header), `right` (the screen's «⋯») on the right.
 * With `scrollY` it comes in once the page is past `objectHeader.collapseAt` (`compactProgress`, over one bar's height — no jump) and
 * takes touches only when in; without it the bar is simply in (the screen shows it where the full header has gone — ObjectScreen
 * puts it over the stuck sections strip). The line `bd` under it only when in. testIDs: `<testID>`, `-expand`, `-back`.
 */
export function ObjectHeaderBar({ title, scrollY, onExpand, expandLabel, back, right, testID }: {
  title: string;
  /** the page's scroll: the bar fades in past `collapseAt`; none — always in */
  scrollY?: SharedValue<number>;
  onExpand: () => void;
  expandLabel: string;
  /** «‹» on the left (its label names where it goes: «Назад») */
  back?: { label: string; onPress: () => void };
  /** the screen's «⋯» (MoreButton) — the last on the right */
  right?: ReactNode;
  testID: string;
}) {
  const { c } = useTheme();
  const at = component.objectHeader.collapseAt;
  const [compact, setCompact] = useState(!scrollY);
  useAnimatedReaction(
    () => (scrollY ? isCompact(scrollY.value, at) : true),
    (now, before) => {
      if (now !== before) runOnJS(setCompact)(now);
    },
    [at, scrollY],
  );
  const fade = useAnimatedStyle(() => ({ opacity: scrollY ? compactProgress(scrollY.value, at, size.hitMin) : 1 }), [scrollY]);
  const side = back || right ? { width: size.hitMin, alignItems: "center" as const } : null;
  return (
    <Animated.View
      testID={testID}
      pointerEvents={compact ? "auto" : "none"}
      accessibilityElementsHidden={!compact}
      importantForAccessibility={compact ? "auto" : "no-hide-descendants"}
      style={[fade, { flexDirection: "row", alignItems: "center", minHeight: size.hitMin, gap: space[1], borderBottomWidth: compact ? component.hairline : 0, borderColor: c.bd }]}
    >
      {side ? <View style={side}>{back ? <IconButton bare testID={`${testID}-back`} icon="chevronLeft" label={back.label} onPress={back.onPress} /> : null}</View> : null}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1] }}>
        <T v="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </T>
        <IconButton bare testID={`${testID}-expand`} icon="chevronDown" label={expandLabel} onPress={onExpand} />
      </View>
      {side ? <View style={side}>{right}</View> : null}
    </Animated.View>
  );
}
