import { Fragment, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { radius, size, space, statusIcon, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { summaryFit } from "./summaryLineFit";

export interface SummaryItem {
  label: string;
  value: string;
  /** a status fact («долг $1,840»): its icon and colour (rule 2 — never the colour alone) */
  status?: StatusName;
  onPress?: () => void;
  /** a pressable item that narrows a list and is on now (map-keeper 27.11, #2993): the «Заливка» `surf2` as every chosen thing
   *  (DS §3.1 «Выбранное — не жёлтое»), said to VoiceOver; pressed again — off */
  selected?: boolean;
  testID?: string;
}

const SEP = " · ";
const TAIL = "…";

/**
 * A line of facts of an object (BUILD-PLAN §1 поток Б): «Работ 3 · Долг $1,840 · Последний визит 12 нояб.» — one line, never wraps;
 * what does not fit is cut at a whole item and the line ends with «…» (`summaryFit`, each item measured where it stands).
 * Label 13 `mut`, value 13 semibold `ink` (a status item — its icon and its status text colour). An item with `onPress` is a button
 * (it opens its filtered list). testIDs: `<testID>`, each item's own `testID`, `<testID>-tail`.
 */
export function SummaryLine({ items, testID }: { items: SummaryItem[]; testID?: string }) {
  const { c } = useTheme();
  const [room, setRoom] = useState(0);
  const widths = useRef<number[]>([]);
  // the widths belong to these words: new words — measured again (a shrunk first item never makes the line flip back and forth)
  const words = items.map((x) => `${x.label}\u0000${x.value}`).join("\u0001");
  const wordsOf = useRef(words);
  if (wordsOf.current !== words) {
    wordsOf.current = words;
    widths.current = [];
  }
  const [sepW, setSepW] = useState(0);
  const [tailW, setTailW] = useState(0);
  const [, redraw] = useState(0);
  const measured = items.every((_, i) => widths.current[i] !== undefined);
  const fit = measured ? summaryFit(widths.current.slice(0, items.length), room, sepW, tailW) : { shown: items.length, cut: false };
  const keep = (i: number) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (w > (widths.current[i] ?? -1)) {
      widths.current[i] = w;
      redraw((n) => n + 1);
    }
  };
  const sep = (
    <T v="caption" tone="mut" numberOfLines={1}>
      {SEP}
    </T>
  );
  return (
    <View testID={testID} onLayout={(e) => setRoom(Math.floor(e.nativeEvent.layout.width))} style={{ flexDirection: "row", alignItems: "center", overflow: "hidden" }}>
      {/* the separator and the tail, measured once out of sight */}
      <View style={{ position: "absolute", opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View onLayout={(e) => setSepW(Math.ceil(e.nativeEvent.layout.width))}>{sep}</View>
        <View onLayout={(e) => setTailW(Math.ceil(e.nativeEvent.layout.width))}>
          <T v="caption" tone="mut">
            {TAIL}
          </T>
        </View>
      </View>
      {items.slice(0, fit.shown).map((x, i) => {
        const body = (
          <View onLayout={keep(i)} style={{ flexDirection: "row", alignItems: "center", gap: space[1], flexShrink: fit.shown === 1 ? 1 : 0, ...(x.onPress ? { paddingHorizontal: space[1], borderRadius: radius.pill, backgroundColor: x.selected ? c.surf2 : undefined } : null) }}>
            {x.status ? <Icon name={statusIcon[x.status]} s={size.iconXs} color={c.status[x.status].text} /> : null}
            <T v="caption" tone="mut" numberOfLines={1}>
              {x.label}
            </T>
            <T v="caption" w="semibold" tone={x.status ?? "ink"} numberOfLines={1} tabular>
              {x.value}
            </T>
          </View>
        );
        return (
          <Fragment key={`${i}-${x.label}`}>
            {i > 0 ? sep : null}
            {x.onPress ? (
              <Press testID={x.testID} onPress={x.onPress} accessibilityRole="button" accessibilityLabel={`${x.label} ${x.value}`.trim()} accessibilityState={{ selected: !!x.selected }} visibleHeight={size.iconMd} {...({ "aria-selected": x.selected ? "true" : "false" } as object)}>
                {body}
              </Press>
            ) : (
              <View testID={x.testID}>{body}</View>
            )}
          </Fragment>
        );
      })}
      {fit.cut ? (
        <View testID={testID ? `${testID}-tail` : undefined} style={{ flexDirection: "row", flexShrink: 0 }}>
          {sep}
          <T v="caption" tone="mut">
            {TAIL}
          </T>
        </View>
      ) : null}
    </View>
  );
}
