import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { ReadOnly } from "./controls";
import { modeRowShape } from "./modeRowLayout";
import { ModeToggle, modeToggleW } from "./modeToggle";
import { T } from "./primitives";

/**
 * A totals row of a group (DS §8.7а, founder 23.11 — audit MAP §12 п.8: «одной строкой: слово · [% · выкл · $] · значение · сумма»):
 * the word, the switch of how the value is set, the value field right in the row and the sum on the right — no sheet. A chosen «%»
 * or «$» is yellow (the founder: «на % или $ переключатель с акцентом»), «Выкл.» in the middle is the neutral cell. Where the row is
 * narrow: still one line — the word takes what is left, the switch is the small toggle `ModeToggle` (#2954); only a large font
 * that leaves no room puts «слово · сумма» first and the toggle with the field under it. `note` — a line under the row (why the
 * switch does not turn, a suggestion). `locked` — read only (a signed estimate): the switch and the field do not change.
 */
export function ModeRow<K extends string>({
  title,
  modes,
  mode,
  off,
  onMode,
  field,
  sum,
  note,
  locked,
  testID,
}: {
  title: string;
  modes: { key: K; label: string }[];
  mode: K;
  /** the position that turns the value off: chosen, it is the neutral cell, not the yellow */
  off: K;
  onMode: (k: K) => void;
  /** the value field (or a short text), `component.modeRow.fieldW` wide; none while off */
  field?: ReactNode;
  /** the sum on the right («−$40.00», «$77.24»); «—» while off */
  sum: string;
  note?: ReactNode;
  locked?: boolean;
  testID?: string;
}) {
  // DS §8.7а (#2954, founder 26.11): «Депозит · маленький переключатель · поле 10 % · сумма» — one line; two only when nothing fits
  const [w, setW] = useState(0);
  const [tw, setTw] = useState(0);
  const shape = modeRowShape(w, tw);
  const withField = !!field && mode !== off;
  const items = modes.map((m) => ({ ...m, sign: m.key !== off && m.label.length <= 2 ? m.label : undefined }));
  const word = (
    <T v="body" numberOfLines={2} style={shape === "wide" ? { width: component.modeRow.titleW } : { flex: 1, minWidth: component.modeToggle.titleMinW }}>
      {title}
    </T>
  );
  const sw = (
    <View onLayout={(e) => setTw(e.nativeEvent.layout.width)}>
      <ReadOnly value={!!locked}>
        {/* a press on the chosen position changes nothing (it never resets a value or asks a question again — code review of #2454) */}
        <ModeToggle items={items} value={mode} off={off} onChange={onMode} label={title} testID={testID ? `${testID}-mode` : undefined} />
      </ReadOnly>
    </View>
  );
  const fieldBox = withField ? (
    <ReadOnly value={!!locked}>
      <View testID={testID ? `${testID}-field` : undefined} style={{ width: shape === "wide" ? component.modeRow.fieldW : component.modeToggle.fieldNarrowW }}>{field}</View>
    </ReadOnly>
  ) : null;
  const total = (
    <View testID={testID ? `${testID}-sum` : undefined} style={{ minWidth: shape === "wide" ? component.modeRow.sumW : component.modeToggle.sumMinW, alignItems: "flex-end", marginLeft: "auto" }}>
      <T v="body" w="semibold" tabular>
        {sum}
      </T>
    </View>
  );
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width - 2 * space[4])} style={{ paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2], minHeight: component.listRow.h, justifyContent: "center" }}>
      {shape !== "two" ? (
        <View testID={testID ? `${testID}-head` : undefined} style={{ flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
          {word}
          {/* the toggle and the field are a block of one width in every row: the toggles stand one under another, a row with no
              field (off, «Скидка —») keeps its toggle in the same column (design review of #2954) */}
          <View style={{ width: modeToggleW(3) + space[2] + (shape === "wide" ? component.modeRow.fieldW : component.modeToggle.fieldNarrowW), flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
            {sw}
            {fieldBox}
          </View>
          {total}
        </View>
      ) : (
        <>
          <View testID={testID ? `${testID}-head` : undefined} style={{ flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
            {word}
            {total}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
            {sw}
            {fieldBox}
          </View>
        </>
      )}
      {note}
    </View>
  );
}
