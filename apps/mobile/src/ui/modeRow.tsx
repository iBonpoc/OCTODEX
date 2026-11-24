import type { ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { ReadOnly, Segmented } from "./controls";
import { T } from "./primitives";

/**
 * A totals row of a group (DS §8.7а, founder 23.11 — audit MAP §12 п.8: «одной строкой: слово · [% · выкл · $] · значение · сумма»):
 * the word, the switch of how the value is set, the value field right in the row and the sum on the right — no sheet. A chosen «%»
 * or «$» is yellow (the founder: «на % или $ переключатель с акцентом»), «Выкл.» in the middle is the neutral cell. Where the row is
 * narrow (a phone, a long word in ES) the field and the sum go to a second line, on the right. `note` — a line under the row (why the
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
  return (
    <View testID={testID} style={{ paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2], minHeight: component.listRow.h, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: space[2], columnGap: space[3] }}>
        {/* the word is a column of one width in the group: the switches stand one under another (design review); a long word wraps */}
        <T v="body" numberOfLines={2} style={{ width: component.modeRow.titleW }}>
          {title}
        </T>
        <ReadOnly value={!!locked}>
          {/* a press on the chosen position changes nothing (it never resets a value or asks a question again — code review of #2454) */}
          <Segmented items={modes} value={mode} onChange={(k) => k !== mode && onMode(k)} accent={mode !== off} radio onCard label={title} testID={testID ? `${testID}-mode` : undefined} />
        </ReadOnly>
        {/* with no field (off) the sum stays on the first line; with one, the field and the sum go together (under it where narrow) */}
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[3], marginLeft: "auto" }}>
          {field && mode !== off ? (
            <ReadOnly value={!!locked}>
              <View style={{ width: component.modeRow.fieldW }}>{field}</View>
            </ReadOnly>
          ) : null}
          <View testID={testID ? `${testID}-sum` : undefined} style={{ minWidth: field && mode !== off ? component.modeRow.sumW : undefined, alignItems: "flex-end" }}>
            <T v="body" w="semibold" tabular>
              {sum}
            </T>
          </View>
        </View>
      </View>
      {note}
    </View>
  );
}
