import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { component, motion, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./controls";
import { ActionBar } from "./actionBar";
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
 * The main step of an object or an editor (BUILD-SPEC §1 MainStepBar; BUILD-PLAN §1 поток Б).
 * `placement="bar"` — the pinned bottom (`ActionBar`, the screen's `footer`): the reason 13 `mut` in one line ABOVE the button, the
 * button 44 across the width (`acc`/`onAcc`, `Button size="bar"`). Variants: `second` — «вторая + главная» in one row (the second
 * outlined); a second label longer than `pair.labelMax` does not stand there — it is not drawn and the screen puts it into «⋯»
 * (`mainStepLayout().secondInMore`); `total` — «Итого ˅» 13 and the sum 22 on the left, the main one on the right (3 : 2 of the
 * bar — not narrower than half); `outline` — the main one outlined when the step is not about selling.
 * `placement="top"` — in the content: the button 40 across the width, the reason under it.
 * Loading (`loading`): nothing for `spinnerDelayMs`, then a spinner by the reason, after `actionTimeoutMs` the reason reads `failedLabel`.
 * Disabled (`main.disabled`) — the reason says why. testIDs: `main.testID`, `second.testID`, `total.testID`, `<main.testID>-reason`.
 */
export function MainStep({
  main,
  placement,
  second,
  total,
  outline,
  loading,
  failedLabel,
}: {
  main: MainAction;
  placement: "top" | "bar";
  second?: MainAction | null;
  total?: MainStepTotal | null;
  outline?: boolean;
  loading?: boolean;
  /** what the reason reads once a loading step took longer than `actionTimeoutMs` («Не получилось») */
  failedLabel?: string;
}) {
  const { c } = useTheme();
  const phase = useLoadPhase(!!loading);
  const { layout } = mainStepLayout({ second, total });
  const reasonText = phase === "failed" ? failedLabel : main.reason;
  const reason =
    reasonText || phase === "spinner" ? (
      <View testID={`${main.testID}-reason`} style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginTop: placement === "top" ? component.mainStep.reasonGap : 0 }}>
        {phase === "spinner" ? <ActivityIndicator color={c.mut} /> : null}
        {reasonText ? (
          <T v="caption" tone="mut" numberOfLines={1} style={{ flexShrink: 1 }}>
            {reasonText}
          </T>
        ) : null}
      </View>
    ) : null;
  const button = (
    <Button
      testID={main.testID}
      label={main.label}
      onPress={main.onPress}
      disabled={main.disabled || phase === "spinner" || phase === "wait"}
      variant={outline ? "secondary" : "primary"}
      size={placement === "bar" ? "bar" : undefined}
      full
    />
  );
  if (placement === "top")
    return (
      <View>
        {button}
        {reason}
      </View>
    );
  let left: ReactNode = undefined;
  if (layout === "pair" && second)
    left = <Button testID={second.testID} label={second.label} onPress={second.onPress} disabled={second.disabled} variant="secondary" size="bar" full />;
  if (layout === "total" && total) left = <TotalPart total={total} />;
  return <ActionBar testID={`${main.testID}-bar`} summary={reason} second={left} main={button} />;
}

function TotalPart({ total }: { total: MainStepTotal }) {
  const { c } = useTheme();
  const body = (
    <View style={{ justifyContent: "center", minHeight: component.mainBar }}>
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
