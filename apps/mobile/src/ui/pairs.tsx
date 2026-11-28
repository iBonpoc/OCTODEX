import { Children, isValidElement, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import { View } from "react-native";
import { component, space } from "@octo/design-tokens";
import { Button, IconButton } from "./controls";
import { Menu, type MenuItem } from "./overlays";
import type { IconKey } from "./primitives";
import type { IconAction } from "./templates/types";
import { buttonPairLayout, fieldRowLayout } from "./pairLayout";
import { RowView } from "./surfaces";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Two buttons of a form, a sheet or a card (visual v2 «Кнопки», DS §7.4; founder 21.11.2026, #2350: «две кнопки в ряд»): in a row
 * `space[2]` apart when both labels fit (`buttonPairLayout`): the filled `main` on the LEFT, the dark `second` (the cell `surf2`, yellow
 * words) after it and, with `icon`, a round icon 40 at the end («☎», «✎») — the v2 order «залитая жёлтая + тёмная + квадрат-значок».
 * A long label or a narrow screen — the column, `main` first (the icon then stands under them on the left). One button (no `second`)
 * — the whole width. The screen does not choose: the rule is here.
 */
export function ButtonPair({ main, second, icon, testID, ids }: { main: ButtonProps; second?: ButtonProps | null | false; icon?: IconAction | null; testID?: string; /** the testIDs of each button's place (the tests find a button inside its place) */ ids?: { main?: string; second?: string } }) {
  const [w, setW] = useState(0);
  const both = second ? [main, second] : [main];
  // the round icon takes its 40 and a gap out of the row first
  const reserve = icon ? component.roundButton.header + space[2] : 0;
  const how = buttonPairLayout(both.map((b) => ({ label: b.label, icon: !!b.icon })), w ? w - reserve : w);
  const square = icon ? <IconButton icon={icon.icon} label={icon.a11y} onPress={icon.onPress} testID={icon.testID} /> : null;
  return (
    <View testID={testID} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: how === "column" ? "column" : "row", alignItems: how === "column" ? "stretch" : "center", gap: space[2] }}>
      {how === "words" ? (
        <>
          <View testID={ids?.main}>
            <Button {...main} />
          </View>
          {second ? (
            <View testID={ids?.second}>
              <Button {...second} variant={second.variant ?? "secondary"} />
            </View>
          ) : null}
          {square}
        </>
      ) : how === "row" && second ? (
        <>
          <View testID={ids?.main} style={{ flex: 1, minWidth: 0 }}>
            <Button {...main} full />
          </View>
          <View testID={ids?.second} style={{ flex: 1, minWidth: 0 }}>
            <Button {...second} variant={second.variant ?? "secondary"} full />
          </View>
          {square}
        </>
      ) : (
        <>
          {icon && !second ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Button {...main} full />
              </View>
              {square}
            </View>
          ) : (
            <View testID={ids?.main}>
              <Button {...main} full />
            </View>
          )}
          {second ? (
            <View testID={ids?.second}>
              <Button {...second} variant={second.variant ?? "secondary"} full />
            </View>
          ) : null}
          {second && square ? <View style={{ alignSelf: "flex-start" }}>{square}</View> : null}
        </>
      )}
    </View>
  );
}

/**
 * One button and its round 40 with a Menu (#2387, founder 21.11 С4: «одна „＋ Позиция“… с каким-то удобным доступом»): the button
 * does the common thing in one press (a new line — many new lines go fast), the round beside it opens the other ways (the catalog,
 * a template, a section, an option) as a Menu at itself. The button takes the row, the round its 40 at the end, `space[2]` apart.
 */
export function ButtonMenu({ main, menu, testID, ids }: {
  main: ButtonProps;
  menu: { icon: IconKey; a11y: string; items: MenuItem<string>[]; onSelect: (k: string) => void; testID?: string };
  testID?: string;
  ids?: { main?: string };
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <View testID={ids?.main} style={{ flex: 1, minWidth: 0 }}>
        <Button {...main} full />
      </View>
      {menu.items.length ? (
        <View ref={ref} collapsable={false} testID={menu.testID}>
          <IconButton icon={menu.icon} label={menu.a11y} onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))} />
          <Menu visible={!!at} anchor={at} items={menu.items} onSelect={menu.onSelect} onClose={() => setAt(null)} />
        </View>
      ) : null}
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
