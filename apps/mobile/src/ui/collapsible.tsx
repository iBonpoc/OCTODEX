import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { motion, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";

/** the heading's words: «Готово · 2» (no count — the title alone) */
export const collapsibleTitle = (title: string, count?: number) => (count === undefined ? title : `${title} · ${count}`);

/** open when controlled (`open` given), else what the component keeps itself */
export const collapsibleOpen = (open: boolean | undefined, own: boolean) => open ?? own;

/**
 * A part that opens under its heading (BUILD-PLAN §1 поток Б): «Подробнее ˅», «Готово · 2 ˅», «Итого ˅». The heading is a row 44
 * high (`size.hitMin`): the title 13 semibold `mut`, the count after « · », the chevron; the part shows under it with a fade
 * (`durBase`; Reduce Motion — at once). Shut by default. Controlled with `open` + `onToggle`, else it keeps its own state.
 * VoiceOver: a button with `expanded`. testIDs: `<testID>` (the heading), `<testID>-body`.
 */
export function Collapsible({
  title,
  count,
  open,
  defaultOpen = false,
  onToggle,
  children,
  testID,
}: {
  title: string;
  count?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
  testID: string;
}) {
  const { c } = useTheme();
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = collapsibleOpen(open, own);
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwn(next);
    onToggle?.(next);
  };
  const words = collapsibleTitle(title, count);
  return (
    <View>
      <Press
        testID={testID}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={words}
        accessibilityState={{ expanded: isOpen }}
        style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: size.hitMin }}
      >
        <T v="caption" w="semibold" tone="mut" numberOfLines={1}>
          {words}
        </T>
        <Icon name={isOpen ? "chevronUp" : "chevronDown"} s={size.iconSm} color={c.mut} />
      </Press>
      {isOpen ? (
        <Animated.View
          testID={`${testID}-body`}
          entering={FadeIn.duration(motion.durBase).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(motion.durFast).reduceMotion(ReduceMotion.System)}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}
