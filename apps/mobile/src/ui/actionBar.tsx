import type { ReactNode } from "react";
import { View } from "react-native";
import { radius, space } from "@octo/design-tokens";
import { Glass } from "./overlays";

/**
 * The pinned panel of a screen's main action (DS §8.9, Н-64): a glass bar at the bottom with the buttons — «Сохранить», «Сохранить и
 * отправить» — and, above them, a short summary (a collapsed «Итого $…»). `Screen footer={…}` pins it and leaves room under the content; on
 * a wide screen the same buttons stand in the page's own column. The buttons are always active (DS §11 п.3): a press with something missing
 * says what (the required-fields rule), a disabled main button says nothing. Not tied to any object: a form, an estimate, a job.
 * The buttons stand IN ONE ROW (the founder's «внизу делаем в ряд», О14): `second` on the left, `main` on the right, widths 2 : 3,
 * 44 high (`Button size="bar"`); with one button it takes the whole width.
 */
export function ActionBar({ main, second, summary, testID }: { main: ReactNode; second?: ReactNode; summary?: ReactNode; testID?: string }) {
  return (
    <Glass strong testID={testID} style={{ borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderBottomWidth: 0, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3], gap: space[2] }}>
      {summary}
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: space[2] }}>
        {second ? <View style={{ flex: 2, minWidth: 0 }}>{second}</View> : null}
        <View style={{ flex: 3, minWidth: 0 }}>{main}</View>
      </View>
    </Glass>
  );
}
