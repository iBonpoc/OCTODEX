import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { ReadOnly, Segmented } from "./controls";
import { modeRowOneLine } from "./modeRowLayout";
import { T } from "./primitives";

/**
 * A totals row of a group (DS §8.7а, founder 23.11 — audit MAP §12 п.8: «одной строкой: слово · [% · выкл · $] · значение · сумма»):
 * the word, the switch of how the value is set, the value field right in the row and the sum on the right — no sheet. A chosen «%»
 * or «$» is yellow (the founder: «на % или $ переключатель с акцентом»), «Выкл.» in the middle is the neutral cell. Where the row is
 * narrow (a phone, a long word in ES): «слово · сумма» on the first line, the switch and the field on the second (#2954). `note` — a line under the row (why the
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
  // DS §8.7а (#2954, founder 26.11: «почему это всё в отдельной строке?»): where the whole row fits — one line; where it does not
  // (a phone) — two lines that read as one thing: «слово · сумма» like every other totals row, and under it the switch and its field
  const [w, setW] = useState(0);
  const [segW, setSegW] = useState(0);
  const withField = !!field && mode !== off;
  const oneLine = modeRowOneLine(w, segW);
  const word = (
    <T v="body" numberOfLines={2} style={oneLine ? { width: component.modeRow.titleW } : { flex: 1, minWidth: 0 }}>
      {title}
    </T>
  );
  const sw = (
    <View onLayout={(e) => setSegW(e.nativeEvent.layout.width)}>
      <ReadOnly value={!!locked}>
        {/* a press on the chosen position changes nothing (it never resets a value or asks a question again — code review of #2454) */}
        <Segmented items={modes} value={mode} onChange={(k) => k !== mode && onMode(k)} accent={mode !== off} radio onCard label={title} testID={testID ? `${testID}-mode` : undefined} />
      </ReadOnly>
    </View>
  );
  const fieldBox = withField ? (
    <ReadOnly value={!!locked}>
      <View testID={testID ? `${testID}-field` : undefined} style={{ width: component.modeRow.fieldW }}>{field}</View>
    </ReadOnly>
  ) : null;
  const total = (
    <View testID={testID ? `${testID}-sum` : undefined} style={{ minWidth: oneLine && withField ? component.modeRow.sumW : undefined, alignItems: "flex-end" }}>
      <T v="body" w="semibold" tabular>
        {sum}
      </T>
    </View>
  );
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width - 2 * space[4])} style={{ paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2], minHeight: component.listRow.h, justifyContent: "center" }}>
      {oneLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[3] }}>
          {/* the word is a column of one width in the group: the switches stand one under another (design review) */}
          {word}
          {sw}
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[3], marginLeft: "auto" }}>
            {fieldBox}
            {total}
          </View>
        </View>
      ) : (
        <>
          <View testID={testID ? `${testID}-head` : undefined} style={{ flexDirection: "row", alignItems: "center", columnGap: space[3] }}>
            {word}
            {total}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[3] }}>
            {sw}
            {fieldBox}
          </View>
        </>
      )}
      {note}
    </View>
  );
}
