import { View } from "react-native";
import { component, radius, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { fillStyle } from "./fill";
import { Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/** the eighths of an inch, as typed («6 3/8»): the key's value */
export const FRAC_KEYS = ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"] as const;
export type FracKey = (typeof FRAC_KEYS)[number];
const GLYPH: Record<FracKey, string> = { "0": "0", "1/8": "⅛", "1/4": "¼", "3/8": "⅜", "1/2": "½", "5/8": "⅝", "3/4": "¾", "7/8": "⅞" };

/**
 * The row of fraction keys (DS §9 А6.3): 0 · ⅛ · ¼ · ⅜ · ½ · ⅝ · ¾ · ⅞ — keys of an input, `button` each (not a choice of chips),
 * always one line, also on 390 (8 equal keys over the column). The current fraction may stand in «Заливка» (`value`).
 * A key is read as its fraction («3/8»). A trade module's fraction row moves onto it in wave G of spec 56.
 */
export function FracKeys({ onKey, value, testID }: { onKey: (k: FracKey) => void; value?: FracKey | null; testID?: string }) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const h = component.button.phone;
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: space[1], flexWrap: "nowrap" }}>
      {FRAC_KEYS.map((k) => {
        const on = value === k;
        return (
          <Press
            key={k}
            testID={testID ? `${testID}-${k.replace("/", "-")}` : undefined}
            onPress={() => onKey(k)}
            disabled={ro}
            visibleHeight={h}
            containerStyle={{ flex: 1, minWidth: 0 }}
            accessibilityRole="button"
            accessibilityLabel={k}
            accessibilityState={{ selected: on }}
            style={{
              minHeight: h,
              // a key, not a chip: a rounded rectangle; not chosen — no fill, the `bd` hairline; chosen — «Заливка» with the field
              // frame `bdField` (the fill alone is ≈ 1.4:1 to a dark card: the frame tells it apart)
              borderRadius: radius.field,
              borderWidth: component.hairline,
              borderColor: on ? c.bdField : c.bd,
              alignItems: "center",
              justifyContent: "center",
              ...(on ? fillStyle(c) : { backgroundColor: "transparent" }),
            }}
          >
            <T v="button" w={on ? "semibold" : "regular"} numberOfLines={1} style={{ color: c.ink }}>
              {GLYPH[k]}
            </T>
          </Press>
        );
      })}
    </View>
  );
}
