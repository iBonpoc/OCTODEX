import { useEffect, useRef, useState, type ElementRef, type ReactNode } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { component, font, motion, radius, size, space } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, T } from "./primitives";
import { Sheet } from "./overlays";
import { Button, TextField } from "./controls";
import { activeFilterCount, chosenFilters, chosenLabel, filterLabel, SEARCH_FROM, searchAfter, sheetOptions, searchState, visibleFilters, type FilterGroup, type FilterItem, type SearchState } from "./filterBarRules";

export type { FilterGroup, FilterOption } from "./filterBarRules";

/**
 * Filters over a list (docs/specs/31-list-filters.md, variant Б — founder 07.11: «очень много кнопок сверху»).
 * - phone / tablet: row 1 — the search and the «Фильтр» button (a number when something is on); row 2 — one lane of
 *   statuses with counts, never wrapped, scrolls sideways; empty ones hidden (visibleFilters);
 * - desktop 1280: one row — the search (panel-w), the lane, a button per group («Метки ▾»);
 * - under it, only when something is on in the sheet: «VIP ✕ · HOA ✕ · Сбросить».
 * The sheet holds the groups as rows (rule 12). No status colour on the chips: chosen = ink frame on surf2 (rule 2).
 */
export function FilterBar<K extends string>({
  search,
  items,
  value,
  onChange,
  groups = [],
  onReset,
}: {
  /** row 1: the search field of the list */
  search?: { value: string; onChange: (s: string) => void; placeholder: string };
  /** the lane: the first is the list's broad default, then the statuses in the order of the work; empty — no lane
   *  (a list whose main switch is elsewhere, e.g. the periods of «Оплаты») */
  items: FilterItem<K>[];
  value: K;
  onChange: (k: K) => void;
  /** the «Фильтр» sheet: sources, people, tags… (only the groups that have options) */
  groups?: FilterGroup[];
  /** «Сбросить»: everything in the sheet off */
  onReset?: () => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { device } = useDevice();
  const desktop = device === "desktop";
  // which sheet is open: all groups (phone, tablet) or one group (a desktop button)
  const [open, setOpen] = useState<string | null>(null);
  // the search inside the sheet (a long «Мастер»), forgotten when the sheet closes
  const [sheetQ, setSheetQ] = useState("");
  const closeSheet = () => { setOpen(null); setSheetQ(""); };
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const shown = groups.filter((g) => g.options.length > 0);
  const active = activeFilterCount(shown);
  const chosen = chosenFilters(shown);

  // web: a vertical mouse wheel scrolls the lane sideways (a horizontal row does not take it by default)
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

  const h = desktop ? component.button.sm : component.button.md;
  const pill = (key: string, label: string, sel: boolean, onPress: () => void, a11y: { role: "radio" | "button"; label: string }, icon?: ReactNode, testID?: string) => (
    <Press
      key={key}
      onPress={onPress}
      visibleHeight={h}
      accessibilityRole={a11y.role}
      accessibilityState={a11y.role === "radio" ? { selected: sel, checked: sel } : undefined}
      {...(a11y.role === "radio" ? ({ "aria-checked": sel } as object) : {})}
      accessibilityLabel={a11y.label}
      testID={testID}
      style={{
        height: h,
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        // chosen: ink frame on the same surface — yellow is kept for the one main action (rule 2)
        backgroundColor: c.surf2,
        borderWidth: sel ? component.selectedBorder : component.hairline,
        borderColor: sel ? c.ink : c.bd,
      }}
    >
      {icon}
      <T v="button" w={sel ? "bold" : undefined} style={{ color: c.ink }}>
        {label}
      </T>
    </Press>
  );

  const lane = (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={desktop ? { flexShrink: 1 } : undefined}
      contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }}
      accessibilityRole="radiogroup"
      testID="filter-lane"
    >
      {visibleFilters(items, value).map((it) => pill(it.key, filterLabel(it), it.key === value, () => onChange(it.key), { role: "radio", label: filterLabel(it) }))}
    </ScrollView>
  );

  // phone / tablet: one square button next to the search, always visible (spec 31 §6 п.3)
  const sliders = <Icon name="sliders" s={size.iconSm} color={c.ink} />;
  // alone in its row (no search, no lane — «Оплаты»): the button says what it is, on the left
  const alone = !search && !items.length;
  const filterButton = shown.length ? (
    <Press
      onPress={() => setOpen("*")}
      visibleHeight={component.button.phone}
      accessibilityRole="button"
      accessibilityLabel={t("fix.filters.a11y", { n: active })}
      testID="filter-button"
      style={{
        height: component.button.phone,
        minWidth: component.button.phone,
        paddingHorizontal: alone ? space[3] : active ? space[2] : 0,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space[1],
        backgroundColor: c.surf2,
        borderWidth: active ? component.selectedBorder : component.hairline,
        borderColor: active ? c.ink : c.bd,
      }}
    >
      {sliders}
      {alone ? (
        <T v="button" w={active ? "bold" : undefined} style={{ color: c.ink }}>
          {active ? `${t("fix.filters.button")} · ${active}` : t("fix.filters.button")}
        </T>
      ) : active ? (
        <T v="button" w="bold" tabular style={{ color: c.ink }}>
          {String(active)}
        </T>
      ) : null}
    </Press>
  ) : null;

  const sheetGroups = open === "*" ? shown : shown.filter((g) => g.key === open);
  // the search is an icon (founder 07.11): a tap opens the field in the same row with focus; a blur or ✕ folds it back.
  // Phone: the open field takes row 1 next to «Фильтр» and the lane drops to row 2 for that time (~100 pt would be left
  // for the lane otherwise). Tablet and desktop: the field (panel-w) stays in the row with the lane.
  const inline = device !== "phone";
  const [searchOpen, setSearchOpen] = useState(false);
  const [rowW, setRowW] = useState(0);
  const st = searchState(searchOpen, search?.value ?? "");
  const fieldW = inline ? component.panelW : Math.max(0, rowW - (filterButton ? component.button.phone + space[2] : 0));
  const searchEl = search ? (
    <SearchToggle
      state={st}
      value={search.value}
      placeholder={search.placeholder}
      width={fieldW}
      onChange={search.onChange}
      onEvent={(ev) => {
        const next = searchAfter(ev, search.value);
        setSearchOpen(next.open);
        if (next.q !== search.value) search.onChange(next.q);
      }}
    />
  ) : null;
  const rowOne = !inline && st === "open";

  return (
    <View style={{ gap: space[2] }} testID="filter-bar">
      {desktop ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          {searchEl}
          <View style={{ flex: 1, minWidth: 0 }}>{items.length ? lane : null}</View>
          {shown.map((g) => {
            const n = g.options.filter((o) => o.on).length;
            return pill(`g:${g.key}`, n ? `${g.title} · ${n}` : g.title, n > 0, () => setOpen(g.key), { role: "button", label: t("fix.filters.a11y", { n }) }, <Icon name="chevronDown" s={size.iconXs} color={c.ink} />, `filter-group-${g.key}`);
          })}
        </View>
      ) : (
        <>
          {/* one row: the magnifier, the lane, «Фильтр»; on a phone the open field sends the lane to row 2.
              Alone in its row (no search, no lane) the «Фильтры» button says what it is, on the left */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
            {searchEl}
            {rowOne || alone ? null : <View style={{ flex: 1, minWidth: 0 }}>{items.length ? lane : null}</View>}
            {filterButton}
          </View>
          {rowOne && items.length ? lane : null}
        </>
      )}
      {chosen.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }} testID="filter-chosen">
          {chosen.map(({ group, option }) => (
            <Press
              testID={group.single ? `filter-chosen-${group.key}` : undefined}
              key={`${group.key}:${option.key}`}
              onPress={() => group.onToggle(option.key)}
              visibleHeight={component.button.sm}
              accessibilityRole="button"
              accessibilityLabel={t("card.filter.remove", { v: chosenLabel(group, option) })}
              style={{ height: component.button.sm, paddingLeft: space[3], paddingRight: space[2], borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: space[1], backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd }}
            >
              <T v="button" w="semibold" style={{ color: c.ink }}>
                {chosenLabel(group, option)}
              </T>
              <Icon name="close" s={size.iconXs} color={c.mut} />
            </Press>
          ))}
          {onReset ? <Button label={t("fix.filters.reset")} variant="ghost" size="sm" onPress={onReset} /> : null}
        </View>
      ) : null}
      <Sheet visible={open !== null} onClose={closeSheet} title={open === "*" ? t("fix.filters.title") : (sheetGroups[0]?.title ?? t("fix.filters.title"))}>
        {sheetGroups.map((g) => (
          <View key={g.key} style={{ gap: space[1] }}>
            {open === "*" ? (
              <T v="caption" w="semibold" tone="mut">
                {g.title}
              </T>
            ) : null}
            {g.searchable && g.options.length > SEARCH_FROM ? (
              <View testID={`filter-find-${g.key}`}>
                <TextField type="search" value={sheetQ} onChangeText={setSheetQ} placeholder={t("card.filter.findPerson")} icon="search" />
              </View>
            ) : null}
            {sheetOptions(g, sheetQ).map((o) => (
              <FilterRow key={o.key} label={o.label} count={o.count} on={o.on} single={g.single} onToggle={() => g.onToggle(o.key)} />
            ))}
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: space[2], marginTop: space[3] }}>
          {active > 0 && onReset ? <Button label={t("fix.filters.reset")} variant="secondary" onPress={onReset} /> : null}
          <Button label={t("fix.filters.done")} variant="secondary" onPress={closeSheet} />
        </View>
      </Sheet>
    </View>
  );
}

/** a row in the «Фильтр» sheet: a tag / a source / a person to show; several can be on (rule 12 — choice menus are rows) */
export function FilterRow({ label, count, on, single, onToggle }: { label: string; count?: number; on: boolean; single?: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  const empty = count === 0;
  return (
    <Press
      onPress={onToggle}
      // one at a time («Мастер» of the Plan) — a radio, round; several — a checkbox
      accessibilityRole={single ? "radio" : "checkbox"}
      accessibilityState={{ checked: on }}
      {...({ "aria-checked": on } as object)}
      accessibilityLabel={count === undefined ? label : `${label} · ${count}`}
      style={{ minHeight: component.rowOption, flexDirection: "row", alignItems: "center", gap: space[3] }}
    >
      <View
        style={{
          width: component.checkbox.size,
          height: component.checkbox.size,
          borderRadius: single ? radius.pill : component.checkbox.radius,
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
      <T v="body" tone={empty && !on ? "mut" : undefined} style={{ flex: 1 }}>
        {label}
      </T>
      {count !== undefined ? (
        <T v="body" tone="mut" tabular>
          {String(count)}
        </T>
      ) : null}
    </Press>
  );
}

/**
 * The search of a list as an icon (founder 07.11, spec 31 §6 п.2а). closed — a magnifier button; closedActive — the same,
 * framed in ink (a search is on, the list stays searched); open — the field grows to `width` (motion.durBase, easeOut;
 * at once with «Уменьшить движение»), takes the focus, ✕ inside empties and folds it.
 */
function SearchToggle({ state, value, placeholder, width, onChange, onEvent }: {
  state: SearchState;
  value: string;
  placeholder: string;
  width: number;
  onChange: (s: string) => void;
  onEvent: (ev: "tap" | "blur" | "clear") => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { wide } = useDevice();
  const reduce = useReducedMotion();
  const h = wide ? component.button.md : component.button.phone;
  const fieldH = wide ? component.field.h : component.field.phone;
  const open = state === "open";
  const grow = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    grow.value = withTiming(open ? 1 : 0, { duration: reduce ? 0 : motion.durBase, easing: Easing.bezier(...motion.easeOut) });
  }, [open, reduce, grow]);
  const target = Math.max(width, h);
  // a blur folds the field a moment later: a press on ✕ blurs the field first (web), and must still reach ✕
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const style = useAnimatedStyle(() => ({ width: interpolate(grow.value, [0, 1], [h, target]) }));
  if (!open)
    return (
      <Press
        onPress={() => onEvent("tap")}
        visibleHeight={h}
        accessibilityRole="button"
        accessibilityLabel={state === "closedActive" ? t("card.filter.searchWith", { q: value.trim() }) : t("card.filter.search")}
        testID="filter-search-toggle"
        style={{
          width: h,
          height: h,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.surf2,
          // on: an ink frame, like a chosen filter — not a colour (rule 2)
          borderWidth: state === "closedActive" ? component.selectedBorder : component.hairline,
          borderColor: state === "closedActive" ? c.ink : c.bd,
        }}
      >
        <Icon name="search" s={size.iconSm} color={c.ink} />
      </Press>
    );
  return (
    <Animated.View style={[{ height: fieldH, borderRadius: radius.field, borderWidth: component.hairline, borderColor: c.ink, backgroundColor: c.in, flexDirection: "row", alignItems: "center", paddingLeft: space[3], gap: space[2], overflow: "hidden" }, style]} testID="filter-search-open">
      <Icon name="search" s={size.iconSm} color={c.mut} />
      <TextInput
        testID="filter-search-field"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.mut}
        autoFocus
        onBlur={() => {
          blurTimer.current = setTimeout(() => onEvent("blur"), motion.durFast);
        }}
        inputMode="search"
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={{ flex: 1, minWidth: 0, height: fieldH, color: c.ink, fontFamily: font.families.regular, fontSize: font.size.body + 2, outlineStyle: "none" } as object}
      />
      <Press
        onPress={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          onEvent("clear");
        }}
        visibleHeight={h}
        accessibilityRole="button"
        accessibilityLabel={t("card.filter.clearSearch")}
        testID="filter-search-clear"
        style={{ width: h, height: h, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="close" s={size.iconSm} color={c.mut} />
      </Press>
    </Animated.View>
  );
}
