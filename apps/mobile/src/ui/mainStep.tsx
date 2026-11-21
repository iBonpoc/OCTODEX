import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { component, motion, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./controls";
import { Glass } from "./overlays";
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
  let left: ReactNode = reason;
  if (layout === "pair" && second) left = <Button testID={second.testID} label={second.label} onPress={second.onPress} disabled={second.disabled} variant="secondary" />;
  if (layout === "total" && total) left = <TotalPart total={total} />;
  // one row: what the step is about on the left, the button by its words on the right (≤ 56 with the padding, LAYOUT-RULES П3)
  return (
    <Glass strong testID={`${main.testID}-bar`} style={{ borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderBottomWidth: 0, paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: component.button.phone }}>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>{left}</View>
        {button}
      </View>
    </Glass>
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
      <T v="title" numberOfLines={1} tabular>
        {total.value}
      </T>
    </View>
  );
  if (!total.onPress) return <View testID={total.testID}>{body}</View>;
  return (
    <Press testID={total.testID} onPress={total.onPress} accessibilityRole="button" accessibilityLabel={`${total.label} ${total.value}`} accessibilityState={{ expanded: !!total.open }}>
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
