import { Children, isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { Button } from "./controls";
import { buttonPairLayout, fieldRowLayout } from "./pairLayout";
import { RowView } from "./surfaces";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Two buttons of a form or a sheet (DS §7.4, founder 21.11.2026, #2350: «если две кнопки в столбик — я бы сделал две кнопки в ряд»):
 * in a row of halves `space[2]` apart when both labels fit (`buttonPairLayout`): `second` on the left, `main` on the right, as the
 * pinned `ActionBar`. A long label or a narrow screen — the column, `main` first. One button (no `second`) — the whole width.
 * The screen does not choose: the rule is here.
 */
export function ButtonPair({ main, second, testID }: { main: ButtonProps; second?: ButtonProps | null | false; testID?: string }) {
  const [w, setW] = useState(0);
  const both = second ? [main, second] : [main];
  const how = buttonPairLayout(both.map((b) => ({ label: b.label, icon: !!b.icon })), w);
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: how === "row" ? "row" : "column", gap: space[2] }}>
      {how === "row" && second ? (
        <>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Button {...second} full />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Button {...main} full />
          </View>
        </>
      ) : (
        <>
          <Button {...main} full />
          {second ? <Button {...second} full /> : null}
        </>
      )}
    </View>
  );
}

/**
 * A pair of fields side by side (DS §9, #2350: «селекторы… дата, время… горизонтально в ряд, если помещаются»): a date and a time,
 * «с — по», a quantity and a unit. In a row of equal shares `space[2]` apart while the width holds each at `pair.fieldMin`
 * (`fieldRowLayout`), else the usual column of a form. Fields inside take the row's width (`flex: 1`, as in `RowView`).
 */
export function FieldRow({ children, testID }: { children: ReactNode; testID?: string }) {
  const [w, setW] = useState(0);
  const items = Children.toArray(children).filter((c) => isValidElement(c));
  const how = fieldRowLayout(w, items.length);
  if (how === "column")
    return (
      <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: space[3] }}>
        {items}
      </View>
    );
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <RowView style={{ alignItems: "flex-start", gap: space[2] }}>
        {items.map((c, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0 }}>
            {c}
          </View>
        ))}
      </RowView>
    </View>
  );
}
