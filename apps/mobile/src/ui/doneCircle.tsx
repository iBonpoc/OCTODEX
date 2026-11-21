import { View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { haptics } from "./haptics";
import { Icon, Press, T } from "./primitives";
import { useReadOnly } from "./readOnly";

/**
 * «Сделано» of a task or a checklist item (DS §9 А4, spec 56 §6): a mark of a deed, not a choice. The circle 22 on the left
 * (`checkbox.size`); empty — the `mut` ring; done — `status.ok.fill` + `check`, the words `mut` and struck through. The only
 * `checkbox` with `checked` in the app (besides `Toggle`'s `switch`). `selection` on a change. With `title` the whole row presses.
 */
export function DoneCircle({
  done,
  onChange,
  label,
  title,
  disabled,
  look,
  testID,
}: {
  done: boolean;
  onChange: (done: boolean) => void;
  /** read aloud («Позвонить Смитам»); without `title` the circle stands alone */
  label: string;
  /** the words beside the circle: struck through when done */
  title?: string;
  disabled?: boolean;
  /** visual v2 «Чек-лист» (`CheckList`): the circle `checkList.dot` 20 — open a dashed ring `dash` on the cell, done a light circle
   *  with a dark check; a row `checkList.row` 34; the done words `mut`, not struck through */
  look?: "list";
  testID?: string;
}) {
  const { c } = useTheme();
  const ro = useReadOnly();
  const off = !!(disabled || ro);
  const list = look === "list";
  const k = component.checkList;
  const s = list ? k.dot : component.checkbox.size;
  const st = c.status.ok;
  return (
    <Press
      testID={testID}
      onPress={() => {
        haptics.selection();
        onChange(!done);
      }}
      disabled={off}
      visibleHeight={s}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: done, disabled: off }}
      // web: React Native Web does not write aria-checked from the state — without it the mark is silent there (as Toggle, P4c)
      {...({ "aria-checked": done, "aria-disabled": off || undefined } as object)}
      style={{ minHeight: list ? k.row : size.hitMin, minWidth: size.hitMin, flexDirection: "row", alignItems: "center", gap: space[3] }}
    >
      <View
        testID={testID ? `${testID}-circle` : undefined}
        style={{
          width: s,
          height: s,
          borderRadius: radius.pill,
          borderWidth: done ? 0 : list ? k.dash : component.checkbox.border,
          borderStyle: list && !done ? "dashed" : "solid",
          borderColor: list ? c.dash : c.mut,
          backgroundColor: list ? (done ? c.ink : c.surf2) : done ? st.fill : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done ? <Icon name="check" s={list ? k.glyph : size.iconSm} color={list ? c.surf : st.on} /> : null}
      </View>
      {title ? (
        <T v="body" tone={done ? "mut" : "ink"} numberOfLines={list ? 1 : undefined} style={{ flex: 1, textDecorationLine: done && !list ? "line-through" : "none" }}>
          {title}
        </T>
      ) : null}
    </Press>
  );
}
