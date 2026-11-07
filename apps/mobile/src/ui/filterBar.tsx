import { useEffect, useRef, useState, type ElementRef, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { component, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, T } from "./primitives";
import { Sheet } from "./overlays";
import { Button } from "./controls";
import { filterLabel, visibleFilters, type FilterItem } from "./filterBarRules";

/**
 * One line of filters over a list (founder 07.11: four rows of chips took half the phone screen).
 * Status chips scroll sideways in one row (mouse wheel and keyboard on the web too); empty ones are hidden
 * (visibleFilters). The rest — tags, sources — sits behind «Фильтры · N» in a sheet, as rows (rule 12).
 */
export function FilterBar<K extends string>({
  items,
  value,
  onChange,
  more,
}: {
  items: FilterItem<K>[];
  value: K;
  onChange: (k: K) => void;
  /** «Фильтры» button: how many extra filters are on and what the sheet holds */
  more?: { active: number; onReset: () => void; children: ReactNode };
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const h = component.button.sm;

  // web: a vertical mouse wheel scrolls the row sideways (a horizontal row does not take it by default)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = (scroller.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || node.scrollWidth <= node.clientWidth) return;
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const chip = (key: string, label: string, sel: boolean, onPress: () => void, a11y: { role: "radio" | "button"; label: string }, icon?: ReactNode) => (
    <Press
      key={key}
      onPress={onPress}
      visibleHeight={h}
      accessibilityRole={a11y.role}
      accessibilityState={a11y.role === "radio" ? { selected: sel, checked: sel } : undefined}
      {...(a11y.role === "radio" ? ({ "aria-checked": sel } as object) : {})}
      accessibilityLabel={a11y.label}
      style={{
        height: h,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        // chosen: ink frame on the same surface — yellow is kept for the one main action (rule 2)
        backgroundColor: c.surf2,
        borderWidth: sel ? component.selectedBorder : 1,
        borderColor: sel ? c.ink : c.bd,
      }}
    >
      {icon}
      <T v="button" w={sel ? "bold" : undefined} style={{ color: c.ink }}>
        {label}
      </T>
    </Press>
  );

  return (
    <View>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }} accessibilityRole="radiogroup">
        {visibleFilters(items, value).map((it) => chip(it.key, filterLabel(it), it.key === value, () => onChange(it.key), { role: "radio", label: filterLabel(it) }))}
        {more
          ? chip(
              "__more",
              more.active > 0 ? `${t("fix.filters.button")} · ${more.active}` : t("fix.filters.button"),
              more.active > 0,
              () => setOpen(true),
              { role: "button", label: t("fix.filters.a11y", { n: more.active }) },
              <Icon name="sliders" s={size.iconSm} color={c.ink} />,
            )
          : null}
      </ScrollView>
      {more ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={t("fix.filters.title")}>
          {more.children}
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[3] }}>
            {more.active > 0 ? <Button label={t("fix.filters.reset")} variant="secondary" onPress={more.onReset} /> : null}
            <Button label={t("fix.filters.done")} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/** a row in the «Фильтры» sheet: a tag / a source to show; several can be on (rule 12 — choice menus are rows) */
export function FilterRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      {...({ "aria-checked": on } as object)}
      accessibilityLabel={label}
      style={{ minHeight: component.rowOption, flexDirection: "row", alignItems: "center", gap: space[3] }}
    >
      <View
        style={{
          width: component.checkbox.size,
          height: component.checkbox.size,
          borderRadius: component.checkbox.radius,
          borderWidth: component.checkbox.border,
          // not yellow: one accent on the screen is the main action (rule 2)
          borderColor: on ? c.ink : c.mut,
          backgroundColor: on ? c.ink : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {on ? <Icon name="check" s={size.iconSm} color={c.bg} /> : null}
      </View>
      <T v="body" style={{ flex: 1 }}>
        {label}
      </T>
    </Press>
  );
}
