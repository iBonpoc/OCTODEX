/**
 * StatTile and StatGrid (visual v2 «Плитки», docs/design/visual-v2.html): a figure and its word on a card tile.
 * Two in a row — `statTile.h` 112, the figure 26/700 (`figure`); three in a row (`StatGrid cols={3}`) — `statTile.hSm` 92, the figure
 * 18/700 (`figureSm`). On top left an icon `statTile.glyph` 15 in a circle `statTile.icon` 28 (the cell `surf2`); the word 12/600 `mut`
 * over the figure; `unit` 12 paler after the figure; `sub` — a line 12 under it («2 просрочены»). The tile is a card (`surf`, the top
 * highlight, no frame). ONE tile of a screen may be `accent` — the yellow fill (Деньги: «Должны»); that is the screen's one yellow
 * (oneAccent.test.ts counts it). «!» — a `status.warn` icon, the tile keeps its colour. A press opens the filtered list; in «Деньги» the
 * tiles switch the view (`selected` → the chosen cell `surf3`, role `tab`). A zero tile is not drawn. With a big system font
 * (fontScale ≥ 1.35) the grid is one column.
 */
import { Children, createContext, isValidElement, useContext, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { component, radius, rhythm, size, space, spaceHalf, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T, type IconKey } from "./primitives";
import { statColumns, statRows, statSaid, statShown } from "./statTileLogic";

/** how many tiles the grid puts in a row (2 — the big tile, 3 — the small one) */
const ColsCtx = createContext<2 | 3 | 4>(2);

export function StatTile({ label, value, unit, unitTone, sub, icon, accent, warn, selected, dense, onPress, a11y, testID }: {
  /** the word (always there — a figure never stands alone) */
  label: string;
  /** the figure: a count or a sum already formatted («$12,400») */
  value: number | string;
  /** the unit after the figure, 12 paler («ч», «дн») */
  unit?: string;
  /** the unit as a status word («1 просроч.» `bad`, v2 Главная) */
  unitTone?: StatusName;
  /** visual v2 Главная «Требует действия»: the tile `statTile.hSm` + 8 = 100 high, the figure 22/700 (`title`) with its unit on its line */
  dense?: boolean;
  /** the line under the figure, 12 `mut`: «1 · 0 закрыто», «за 7 дн» — what the figure is of */
  sub?: string;
  /** the icon in the circle on top left */
  icon?: IconKey;
  /** the screen's one yellow tile (v2: Деньги — «Должны») */
  accent?: boolean;
  /** «!» with the reason a screen reader hears («2 просрочены») */
  warn?: string;
  /** «Деньги»: the tile is a tab of the view; the chosen one is the chosen cell */
  selected?: boolean;
  onPress?: () => void;
  /** what a screen reader hears; default «label: value[, sub][, warn]» */
  a11y?: string;
  testID?: string;
}) {
  const { c } = useTheme();
  const cols = useContext(ColsCtx);
  if (!statShown(value)) return null;
  const said = a11y ?? statSaid(label, unit ? `${value} ${unit}` : value, sub, warn);
  const small = cols === 3;
  const ink = accent ? c.onAcc : c.ink;
  const mut = accent ? c.onAccMut : c.mut;
  const tile = (
    <View
      style={{
        minHeight: dense ? component.statTile.hSm + space[2] : small ? component.statTile.hSm : component.statTile.h,
        padding: small ? space[3] - spaceHalf.hair : space[3],
        borderRadius: radius.card,
        backgroundColor: accent ? c.acc : selected ? c.surf3 : c.surf,
        borderTopWidth: component.hairline,
        borderTopColor: accent ? c.accEdge : c.hl,
        borderWidth: accent ? component.hairline : 0,
        borderColor: accent ? c.accEdge : "transparent",
        justifyContent: "space-between",
        gap: spaceHalf.tight,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {icon ? (
          <View style={{ width: component.statTile.icon, height: component.statTile.icon, borderRadius: radius.pill, backgroundColor: accent ? c.onAccTint : c.surf2, alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} s={component.statTile.glyph} color={ink} />
          </View>
        ) : (
          <View />
        )}
        {warn ? <Icon name="alert" s={size.iconSm} color={accent ? c.onAcc : c.status.warn.text} /> : null}
      </View>
      <View>
        <T v="micro" style={{ color: mut }} numberOfLines={2}>
          {label}
        </T>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[1] }}>
          <T v={dense ? "title" : small ? "figureSm" : "figure"} style={{ color: ink, flexShrink: 1 }} numberOfLines={1}>
            {value}
          </T>
          {unit ? (
            <T v="micro" style={{ color: unitTone && !accent ? c.status[unitTone].text : mut, flexShrink: 1 }} numberOfLines={1}>
              {unit}
            </T>
          ) : null}
        </View>
        {sub ? (
          <View testID={testID ? `${testID}-sub` : undefined}>
            <T v="micro" style={{ color: mut }} numberOfLines={1}>
              {sub}
            </T>
          </View>
        ) : null}
      </View>
    </View>
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

/**
 * The grid of tiles (`rhythm.cardGap` 8 apart): two in a row (the big tile) or `cols={3}` (the small one); zero tiles are already
 * gone, the rest fill the rows; one column with a big font.
 */
/** `cols={4}` — the tiles of 2 × 2 in one row of a desktop width (1280: no tile wider than a third of the screen) */
export function StatGrid({ children, cols: want = 2, testID }: { children: ReactNode; cols?: 2 | 3 | 4; testID?: string }) {
  const { fontScale } = useWindowDimensions();
  const cols = statColumns(fontScale) === 1 ? 1 : want;
  // a zero tile draws nothing: it takes no place in the grid either
  const items = Children.toArray(children).filter((x) => !(isValidElement<{ value?: number | string }>(x) && x.props.value !== undefined && !statShown(x.props.value)));
  const rows = statRows(items, cols);
  return (
    <ColsCtx.Provider value={want}>
      <View style={{ gap: rhythm.cardGap }} testID={testID}>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", gap: rhythm.cardGap }}>
            {r}
            {/* the last row keeps its places when it is short */}
            {Array.from({ length: cols - r.length }, (_, k) => (
              <View key={`gap${k}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
    </ColsCtx.Provider>
  );
}
