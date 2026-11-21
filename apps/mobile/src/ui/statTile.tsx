/**
 * StatTile and StatGrid (BUILD-SPEC §1 «StatTile»): a big figure and its word on a pastel tile, two in a row (2×2).
 * The tile: from `statTile.h` 88 tall, `radius.card`, padding 16; the word 12 semibold in capitals, the figure 30 bold;
 * the fill `pastels[theme][lav|mint|butter|peach]` — the pastel is never alone, the word is always on it (rule 2, palette A).
 * `sub` — a line 13 under the figure in the pastel's text («1 · 0 закрыто»). «!» — a `status.warn` icon, the tile's own colour does not change. A press opens the filtered list; in «Деньги» the tiles
 * switch the view (`selected` → a 2 frame in the pastel's text, role `tab`). A zero tile is not drawn.
 * With a big system font (fontScale ≥ 1.35) the grid is one column.
 */
import { Children, isValidElement, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { component, pastels, size, space, type PastelName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { Card } from "./surfaces";
import { statColumns, statRows, statSaid, statShown } from "./statTileLogic";

export function StatTile({ label, value, sub, pastel, warn, selected, onPress, a11y, testID }: {
  /** the word (always there — the pastel never speaks alone) */
  label: string;
  /** the figure: a count or a sum already formatted («$12,400») */
  value: number | string;
  /** the line under the figure, 13 in the pastel's text: «1 · 0 закрыто», «за 7 дн», «в среду» — what the figure is of */
  sub?: string;
  pastel: PastelName;
  /** «!» with the reason a screen reader hears («2 просрочены») */
  warn?: string;
  /** «Деньги»: the tile is a tab of the view; the chosen one has a frame */
  selected?: boolean;
  onPress?: () => void;
  /** what a screen reader hears; default «label: value[, warn]» */
  a11y?: string;
  testID?: string;
}) {
  const { c, name } = useTheme();
  if (!statShown(value)) return null;
  const p = pastels[name][pastel];
  const said = a11y ?? statSaid(label, value, sub, warn);
  const tile = (
    <Card
      style={{
        minHeight: component.statTile.h,
        backgroundColor: p.fill,
        borderColor: selected ? p.text : p.fill,
        borderWidth: selected ? component.selectedBorder : component.hairline,
        shadowOpacity: 0,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
        <T v="micro" w="semibold" style={{ color: p.text, flex: 1, textTransform: "uppercase" }} numberOfLines={2}>
          {label}
        </T>
        {warn ? <Icon name="alert" s={size.iconSm} color={c.status.warn.text} /> : null}
      </View>
      <View>
        <T v="display" w="bold" style={{ color: p.text }} tabular numberOfLines={1}>
          {value}
        </T>
        {sub ? (
          <View testID={testID ? `${testID}-sub` : undefined}>
            <T v="caption" style={{ color: p.text }} numberOfLines={1}>
              {sub}
            </T>
          </View>
        ) : null}
      </View>
    </Card>
  );
  if (!onPress)
    return (
      <View accessible accessibilityLabel={said} testID={testID} style={{ flex: 1 }}>
        {tile}
      </View>
    );
  return (
    <Press
      onPress={onPress}
      accessibilityRole={selected === undefined ? "button" : "tab"}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={said}
      testID={testID}
      containerStyle={{ flex: 1 }}
    >
      {tile}
    </Press>
  );
}

/** The 2×2 grid of tiles (`space[3]` apart); zero tiles are already gone, the rest fill the rows; one column with a big font. */
export function StatGrid({ children, testID }: { children: ReactNode; testID?: string }) {
  const { fontScale } = useWindowDimensions();
  const cols = statColumns(fontScale);
  // a zero tile draws nothing: it takes no place in the grid either
  const items = Children.toArray(children).filter((x) => !(isValidElement<{ value?: number | string }>(x) && x.props.value !== undefined && !statShown(x.props.value)));
  const rows = statRows(items, cols);
  return (
    <View style={{ gap: space[3] }} testID={testID}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space[3] }}>
          {r}
          {/* the last row keeps its half when it has one tile */}
          {r.length < cols ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}
