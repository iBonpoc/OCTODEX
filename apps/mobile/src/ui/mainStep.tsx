import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { component, motion, radius, rhythm, size, space, spaceHalf } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, IconButton } from "./controls";
import { Icon, Press, T } from "./primitives";
import { loadPhase, mainStepLayout } from "./mainStepRules";
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
   *  `ghost` by its words («Отменить»); the total keeps its place on the left. Only when there is something to take back */
  aside?: MainAction | null;
}) {
  const { c } = useTheme();
  const phase = useLoadPhase(!!loading);
  const { layout } = mainStepLayout({ second, total, reason: placement === "bar" ? main.reason : undefined });
  const reasonText = phase === "failed" ? failedLabel : main.reason;
  const reason =
    reasonText || phase === "spinner" ? (
      <View testID={`${main.testID}-reason`} style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: placement === "top" ? component.mainStep.reasonGap : 0 }}>
        {phase === "spinner" ? <ActivityIndicator color={c.mut} /> : null}
        {reasonText ? (
          <T v="caption" tone="mut" numberOfLines={placement === "bar" ? 2 : 1} style={{ flexShrink: 1 }}>
            {reasonText}
          </T>
        ) : null}
      </View>
    ) : null;
  const byWords = placement === "bar" || fit;
  const button = (
    <Button
      testID={main.testID}
      label={main.label}
      onPress={main.onPress}
      disabled={main.disabled || phase === "spinner" || phase === "wait"}
      variant={outline || main.outline ? "secondary" : "primary"}
      full={!byWords}
    />
  );
  if (placement === "top")
    return (
      <View style={fit ? { alignSelf: "flex-start", maxWidth: "100%" } : undefined}>
        {button}
        {reason}
      </View>
    );
  if (placement === "bar" && folded && total && onUnfold)
    return (
      // the SAME height as the open card (`figureRow.h`): the bar never changes its height — the page's end and the drag's edge stay put
      <View style={{ paddingBottom: rhythm.cardGap, height: component.figureRow.h + rhythm.cardGap, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: space[2] }}>
        {foldAdd ? <IconButton icon="plus" label={foldAdd.a11y} onPress={foldAdd.onPress} testID={foldAdd.testID} /> : null}
        {/* rule 29: the capsule is the Button itself (secondary 40, zone 44) — the sum and «˄» */}
        <Button testID={`${main.testID}-capsule`} label={total.value} icon="chevronUp" variant="secondary" onPress={onUnfold} accessibilityLabel={`${total.label} ${total.value}`} />
      </View>
    );
  let left: ReactNode = reason;
  if (layout === "pair" && second) left = <Button testID={second.testID} label={second.label} onPress={second.onPress} disabled={second.disabled} variant="secondary" />;
  if (layout === "total" && total) left = <TotalPart total={total} />;
  // visual v2 «Редактор» (макет 5, образец №5 «Approximate amount 640 · Schedule»): the bottom is a card `figureRow.h` 64, radius 22,
  // 16 from the sides (the Screen's footer) and `cardGap` 8 over the bottom zone, on the cell `surf2` with the card's shadow — what the step
  // is about on the left, the button 40 by its words on the right
  return (
    // (the Screen's footer already stands `rhythm.screen` from the sides)
    <View style={{ paddingBottom: rhythm.cardGap }}>
      <View
        testID={`${main.testID}-bar`}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: component.button.phone }}>
          <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>{left}</View>
          {aside ? <Button testID={aside.testID} label={aside.label} onPress={aside.onPress} variant="ghost" /> : null}
          {button}
        </View>
      </View>
    </View>
  );
}

function TotalPart({ total }: { total: MainStepTotal }) {
  const { c } = useTheme();
  const body = (
    <View style={{ justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
        <T v="caption" tone="mut" numberOfLines={1}>
          {total.label}
        </T>
        {total.onPress ? <Icon name={total.open ? "chevronUp" : "chevronDown"} s={size.iconSm} color={c.mut} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2] - spaceHalf.hair }}>
        <T v="title" numberOfLines={1} tabular>
          {total.value}
        </T>
        {total.sub ? (
          <T v="micro" w="semibold" tone="mut" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
            {total.sub}
          </T>
        ) : null}
      </View>
    </View>
  );
  if (!total.onPress) return <View testID={total.testID}>{body}</View>;
  return (
    <Press testID={total.testID} onPress={total.onPress} accessibilityRole="button" accessibilityLabel={`${total.label} ${total.value}`} accessibilityState={{ expanded: !!total.open }} aria-expanded={!!total.open}>
      {body}
    </Press>
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
