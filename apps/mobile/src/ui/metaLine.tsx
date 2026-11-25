import { useRef, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { component, size, space } from "@octo/design-tokens";
import { MetaTag } from "./controls";
import { Press } from "./primitives";

/**
 * One line of facts that never wraps (DS §9 А1в, spec 56 §3а.6): the fixed parts first (a number, a status chip — the screen's own
 * nodes), then the tags as `MetaTag`; the tags that do not fit go into «+N». Each tag's width is measured where it stands and kept,
 * so the line knows what fits at any width; until «+N» is measured it keeps `size.hitMin` for it. With `onTags` the tags are one
 * button (their sheet opens); with no tags it shows `addLabel` («＋ Метка»). testIDs: `<testID>-tags`, `-more`, `-add`.
 */
export function MetaLine({
  fixed,
  tags,
  onTags,
  tagsLabel,
  addLabel,
  moreLabel,
  testID,
}: {
  fixed: ReactNode[];
  tags: { id: string; label: string }[];
  onTags?: () => void;
  /** what the tags' button reads («Метки: VIP, Постоянный») */
  tagsLabel: string;
  /** shown when there are no tags (and `onTags` is set) */
  addLabel?: string;
  /** what «+N» reads («ещё 2») */
  moreLabel: (n: number) => string;
  testID?: string;
}) {
  const gap = space[2];
  const [rowW, setRowW] = useState(0);
  const [fixedW, setFixedW] = useState(0);
  const widths = useRef<Record<string, number>>({});
  const [plusW, setPlusW] = useState(0);
  const [, redraw] = useState(0);
  const measured = tags.every((x) => widths.current[x.id] !== undefined);
  // how many tags fit: all, while not measured yet (they are drawn to be measured; the line hides what runs over)
  let shown = tags.length;
  if (rowW && measured) {
    const room = rowW - fixedW;
    const sum = (k: number) => tags.slice(0, k).reduce((a, x) => a + widths.current[x.id]! + gap, 0);
    if (sum(tags.length) > room) {
      shown = 0;
      for (let k = tags.length - 1; k >= 0; k--)
        if (sum(k) + (plusW || size.hitMin) + gap <= room) {
          shown = k;
          break;
        }
    }
  }
  const hidden = tags.length - shown;
  const keep = (id: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (widths.current[id] !== w) {
      widths.current[id] = w;
      redraw((n) => n + 1);
    }
  };
  const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
  const tagsNode = (
    <View style={{ flexDirection: "row", alignItems: "center", gap, flexShrink: 0 }}>
      {tags.slice(0, shown).map((x) => (
        <View key={x.id} onLayout={keep(x.id)} style={{ flexShrink: 0 }}>
          <MetaTag label={x.label} />
        </View>
      ))}
      {hidden > 0 ? (
        <View testID={id("more")} onLayout={(e) => setPlusW(Math.ceil(e.nativeEvent.layout.width))} style={{ flexShrink: 0 }} accessibilityLabel={moreLabel(hidden)}>
          <MetaTag label={`+${hidden}`} />
        </View>
      ) : null}
      {!tags.length && addLabel ? (
        <View testID={id("add")}>
          <MetaTag label={addLabel} />
        </View>
      ) : null}
    </View>
  );
  return (
    <View testID={testID} onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))} style={{ flexDirection: "row", alignItems: "center", gap, overflow: "hidden" }}>
      <View onLayout={(e) => setFixedW(Math.ceil(e.nativeEvent.layout.width) + gap)} style={{ flexDirection: "row", alignItems: "center", gap, flexShrink: 0 }}>
        {fixed}
      </View>
      {onTags && (tags.length || addLabel) ? (
        <Press testID={id("tags")} onPress={onTags} visibleHeight={component.chip.h} accessibilityRole="button" accessibilityLabel={tags.length ? tagsLabel : addLabel}>
          {tagsNode}
        </Press>
      ) : tags.length ? (
        tagsNode
      ) : null}
    </View>
  );
}
