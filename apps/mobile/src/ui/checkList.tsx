/**
 * CheckList (visual v2 «Чек-лист», образец №1 AGFlow): the items of a visit's or a job's list in a column joined by one line.
 * Each item is a `DoneCircle look="list"` (the one mark of a deed, a `checkbox` with `checked`): a row `checkList.row` 34, the circle
 * `checkList.dot` 20 — open a dashed ring, done a light circle with a dark check; the word 15/500, a done one `mut`. One line
 * `checkList.line` 1 `off` runs through the circles' centres from the first to the last. Inside `ReadOnly` the marks do not press. testIDs: `<testID>-<key>`.
 */
import { View } from "react-native";
import { component } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { DoneCircle } from "./doneCircle";

export type CheckItem = { key: string; label: string; done: boolean };

export function CheckList({ items, onToggle, testID }: { items: CheckItem[]; onToggle: (key: string, done: boolean) => void; testID?: string }) {
  const { c } = useTheme();
  const k = component.checkList;
  if (!items.length) return null;
  return (
    <View testID={testID}>
      {items.length > 1 ? (
        <View pointerEvents="none" style={{ position: "absolute", left: (k.dot - k.line) / 2, top: k.row / 2, bottom: k.row / 2, width: k.line, backgroundColor: c.off }} />
      ) : null}
      {items.map((it) => (
        <DoneCircle
          key={it.key}
          look="list"
          done={it.done}
          label={it.label}
          title={it.label}
          onChange={(d) => onToggle(it.key, d)}
          testID={testID ? `${testID}-${it.key}` : undefined}
        />
      ))}
    </View>
  );
}
