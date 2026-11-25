/** TEMPORARY mock for #2412 circle 4 (not committed): Gutter / Downspout windows on the real src/ui components. `?v=<view>` */
import { useEffect, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import { component, font, radius, size, space } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Button, Segmented, TextField } from "@/ui/controls";
import { SelectField } from "@/ui/selectField";
import { Stepper } from "@/ui/controls";
import { ToggleRow } from "@/ui/toggleRow";
import { Collapsible } from "@/ui/collapsible";
import { ListGroup } from "@/ui/groupedList";
import { Menu, Sheet } from "@/ui/overlays";
import { Icon, Press, T } from "@/ui/primitives";
import { ListRow } from "@/ui/surfaces";
import { MODULE_CHOICES } from "@/modules/gutters/settings";
import { runFor, dsFor } from "@/modules/gutters/canvas/toolDefaults";
import { AttrBody, DsAttrsView, RunAttrsView } from "@/modules/gutters/draw/AttrPanel";

/* ---------- colours (mock only: the swatch tokens do not exist yet) ---------- */
const COLORS: { key: string; label: string; hex: string }[] = [
  { key: "white", label: "High Gloss White", hex: "#F7F7F4" },
  { key: "w80", label: "80 White", hex: "#EDEDE8" },
  { key: "black", label: "Black", hex: "#1B1B1B" },
  { key: "clay", label: "Natural Clay", hex: "#B5A488" },
  { key: "musket", label: "Musket Brown A", hex: "#6E5B48" },
  { key: "royal", label: "Royal Brown", hex: "#4A3226" },
  { key: "ampdb", label: "AMP Dark Bronze", hex: "#3A322C" },
  { key: "dbronze", label: "Dark Bronze", hex: "#4A3F36" },
  { key: "grecian", label: "Grecian Green", hex: "#4F6B52" },
];
const hexOf = (label: string) => COLORS.find((x) => x.label === label)?.hex ?? "transparent";

/* ---------- a select with a 2-line value and a swatch (what SelectField does not have yet) ---------- */
function Sel({ label, value, swatch, placeholder = "—", flex = 1, error, inside }: { label: string; value?: string; swatch?: string; placeholder?: string; flex?: number; error?: boolean; inside?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex, minWidth: 0, gap: space[1] }}>
      {inside ? null : <T v="micro" tone="mut">{label}</T>}
      <Press visibleHeight={size.fieldPhone} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: size.fieldPhone, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.field, borderWidth: component.hairline, borderColor: error ? c.status.warn.fill : c.bdField, backgroundColor: c.in }}>
        {inside ? <T v="body" style={{ flex: 1 }} numberOfLines={1}>{label}</T> : null}
        {swatch ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: swatch, borderWidth: 1, borderColor: c.bd }} /> : null}
        <T v="body" tone={value && !inside ? "ink" : "mut"} numberOfLines={2} style={inside ? { flexShrink: 1, textAlign: "right" } : { flex: 1, minWidth: 0 }}>{value ?? placeholder}</T>
        <Icon name="chevronDown" s={size.iconSm} color={c.mut} />
      </Press>
    </View>
  );
}

/** a one-line warning under a field: warn mark + words */
function Warn({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
      <Icon name="alert" s={size.iconSm} color={c.status.warn.text} />
      <T v="caption" style={{ color: c.status.warn.text }}>{children}</T>
    </View>
  );
}

/** «Elbow A · 75° ⌄ · − n +» in one line */
function CountRow({ label, value, qty, items }: { label: string; value: string; qty: number; items: { key: string; label: string }[] }) {
  const [v, setV] = useState(value);
  const [n, setN] = useState(qty);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <View style={{ width: 74 }}><T v="body" w="semibold" numberOfLines={1}>{label}</T></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SelectField label="" value={v} items={items} onChange={setV} />
      </View>
      <View style={{ width: 166 }}>
        <Stepper label="" value={n} min={0} max={12} onChange={setN} />
      </View>
    </View>
  );
}
const ANGLES = ["30°", "45°", "60°", "75°", "90°"].map((x) => ({ key: x, label: x }));
const OFFS = [{ key: "1″", label: "1″" }, { key: "2″", label: "2″" }, { key: "4″", label: "4″" }, { key: "own", label: "Свой…" }];

/* ---------- the tape: standard US, 1″ across the window ---------- */
const LEN = [54, 44, 34, 24, 16, 10];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const fracText = (n32: number) => {
  const g = gcd(n32, 32);
  return { n: n32 / g, d: 32 / g };
};
function Ruler({ n32 }: { n32: number }) {
  const { c } = useTheme();
  const [w, setW] = useState(342);
  const v = n32 / 32;
  const H = 102;
  const els: ReactNode[] = [];
  const k0 = Math.floor((v - 0.56) * 32);
  const k1 = Math.ceil((v + 0.56) * 32);
  for (let k = k0; k <= k1; k++) {
    const x = w / 2 + (k / 32 - v) * w;
    const m = ((k % 32) + 32) % 32;
    const lvl = m === 0 ? 0 : m === 16 ? 1 : m % 8 === 0 ? 2 : m % 4 === 0 ? 3 : m % 2 === 0 ? 4 : 5;
    const len = LEN[lvl]!;
    els.push(<Line key={`t${k}`} x1={x} x2={x} y1={0} y2={len} stroke={c.ink} strokeWidth={lvl === 0 ? 1.8 : lvl === 1 ? 1.4 : 1} opacity={lvl >= 4 ? 0.8 : 1} />);
    if (lvl <= 4) {
      if (lvl === 0) {
        els.push(<SvgText key={`l${k}`} x={x} y={len + 17} fill={c.ink} fontSize={15} fontFamily={font.families.bold} textAnchor="middle">{`${Math.floor(k / 32)}″`}</SvgText>);
      } else {
        const { n, d } = fracText(m);
        const fs = lvl === 1 ? 11 : lvl === 2 ? 10 : lvl === 3 ? 9 : 8.5;
        const y = len + fs + 1;
        els.push(<SvgText key={`n${k}`} x={x} y={y} fill={c.ink} fontSize={fs} fontFamily={font.families.semibold} textAnchor="middle">{String(n)}</SvgText>);
        els.push(<Line key={`b${k}`} x1={x - fs * 0.6} x2={x + fs * 0.6} y1={y + 2.5} y2={y + 2.5} stroke={c.ink} strokeWidth={0.8} />);
        els.push(<SvgText key={`d${k}`} x={x} y={y + fs + 3} fill={c.ink} fontSize={fs} fontFamily={font.families.semibold} textAnchor="middle">{String(d)}</SvgText>);
      }
    }
  }
  const text = n32 === 0 ? "0″" : `${fracText(n32).n}/${fracText(n32).d}″`;
  return (
    <View style={{ alignItems: "center" }}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: "stretch", height: H, borderRadius: radius.field, backgroundColor: c.surf2, overflow: "hidden" }}>
        <Svg width={w} height={H}>
          {els}
          <Line x1={w / 2} x2={w / 2} y1={H - 22} y2={H} stroke="#FF3B30" strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ marginTop: -space[2], paddingHorizontal: space[4], height: 30, minWidth: 56, borderRadius: radius.pill, backgroundColor: c.acc, alignItems: "center", justifyContent: "center" }}>
        <T v="button" style={{ color: c.onAcc }}>{text}</T>
      </View>
    </View>
  );
}

/* ---------- the window ---------- */
function Win({ title, children, hideClose = true, footer = true }: { title: string; children: ReactNode; hideClose?: boolean; footer?: boolean }) {
  const { c } = useTheme();
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 300); return () => clearTimeout(id); }, []);
  return (
    <Sheet
      visible={on}
      onClose={() => {}}
      title={title}
      height="large"
      hideClose={hideClose}
      footer={footer ? (
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <View style={{ flex: 1 }}><Button label="Закрыть" variant="ghost" size="bar" full style={{ backgroundColor: c.surf2 }} /></View>
          <View style={{ flex: 1 }}><Button label="Сохранить" size="bar" full /></View>
        </View>
      ) : undefined}
    >
      <View style={{ gap: space[3], paddingBottom: space[4] }}>{children}</View>
    </Sheet>
  );
}

const UNITS = [{ key: "in", label: "ft · in · дробь" }, { key: "mm", label: "мм" }];

/* ---------- Gutter ---------- */
const MOUNTS = ["Hidden Hanger", "Hidden Hanger with Screw", "Heavy Duty Hidden Hanger", "#40 Fascia Hanger with Snap Strap", "#41 Rafter Hanger with Snap Strap", "Wrap Around Hanger", "Premium Fascia Hanger with Crossbar", "Custom Crossbar Hanger"].map((x) => ({ key: x, label: x }));
function Gutter({ ready, more, mm }: { ready?: boolean; more?: boolean; mm?: boolean }) {
  const { c } = useTheme();
  const [u, setU] = useState<"in" | "mm">(mm ? "mm" : "in");
  const frac = ready ? 10 : 0; // 32nds: 10 → 5/16
  const lenText = mm || u === "mm" ? "3810 мм · 12′ 6″" : ready ? "12′ 6 5/16″" : "12′ 6″";
  const color = ready ? "High Gloss White" : undefined;
  const open = more ?? !ready;
  const mount = ready ? "Hidden Hanger with Screw" : undefined;
  return (
    <Win title="Gutter № 1">
      {ready ? null : <T v="caption" tone="mut">Задаёт все Gutter этого замера</T>}
      <T v="caption" tone="mut">{`линия · ${lenText}`}</T>
      <Segmented full equal radio label="Единицы" items={UNITS} value={u} onChange={setU} />
      {u === "mm" ? (
        <>
          <View style={{ gap: space[1] }}>
            <T v="micro" tone="mut">Длина</T>
            <TextField type="number" value="3810" onChangeText={() => {}} suffix="мм" label="Длина, мм" />
          </View>
          <T v="caption" tone="mut">Рулетка — только дюймы</T>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: space[1] }}><T v="micro" tone="mut">Футы</T><TextField type="number" value="12" onChangeText={() => {}} suffix="ft" label="Футы" /></View>
            <View style={{ flex: 1, gap: space[1] }}><T v="micro" tone="mut">Дюймы</T><TextField type="number" value="6" onChangeText={() => {}} suffix="in" label="Дюймы" /></View>
            <View style={{ flex: 1.05 }}>
              <SelectField labelAbove label="Дробь" value={ready ? "5/16" : "0"} items={["0", "1/32", "1/16", "3/32", "1/8", "5/32", "3/16", "7/32", "1/4", "5/16", "3/8", "1/2"].map((x) => ({ key: x, label: x }))} onChange={() => {}} />
            </View>
          </View>
          <Ruler n32={frac} />
        </>
      )}
      <View style={{ flexDirection: "row", gap: space[1], alignItems: "flex-start" }}>
        <Sel flex={0.85} label="Размер" value="5″" />
        <Sel flex={1.6} label="Цвет" value={color} swatch={color ? hexOf(color) : undefined} />
        <Sel flex={0.95} label="Этаж" value="1 эт." />
      </View>
      <T v="caption" tone="mut">Цвет один на весь замер</T>
      {ready ? null : <Warn>Выберите цвет</Warn>}
      <SelectField label="Профиль" value="K" items={[{ key: "K", label: "K" }]} onChange={() => {}} />
      <Collapsible testID="more" open={open} title={open || !ready ? "Ещё" : "Ещё: Hidden Hanger with Screw · Алюминий · .027″"}>
        <View style={{ gap: space[3] }}>
          <SelectField label="Крепление" value={mount ?? null} items={MOUNTS} onChange={() => {}} />
          {mount ? null : <Warn>Выберите крепление</Warn>}
          <SelectField label="Материал" value="Алюминий" items={[{ key: "Алюминий", label: "Алюминий" }]} onChange={() => {}} />
          <SelectField label="Толщина" value=".027″" items={[{ key: ".027″", label: ".027″" }]} onChange={() => {}} />
          <SelectField label="Край крыши" value={null} placeholder="не задан" items={[{ key: "a", label: "Fascia" }]} onChange={() => {}} />
        </View>
      </Collapsible>
    </Win>
  );
}

/* ---------- Downspout ---------- */
type Kind = "smooth" | "ribbed" | "round";
const BOTTOMS = ["Ничего", "Splash Blocks", "Flex-A-Spout", "В землю", "На нижнюю крышу"];
const TOPS = ["Ничего", "Funnel", "Square Corrugated “Y” Funnel", "#14 Ornate Conductor Head, Soldered", "Plain Tapered Conductor Head, Riveted", "Molded Universal Conductor Head"];
const WALLS_RECT = ["—", "Universal Band", "Square Stamped Sickle Hook", "Heavy Duty Channel Brick Hook", "Metco Ornamental Conductor Band", "U-Bracket Downspout Hanger", "Conductor Bracket Downspout Hanger", "Sq. Side Fasten / Wire Downspout Hooks"];
const WALLS_ROUND = [...WALLS_RECT, "#31 Pipe Cleat"];
function Downspout({ kind, ready, more, floors = 1 }: { kind: Kind; ready?: boolean; more?: boolean; floors?: number }) {
  const round = kind === "round";
  const kindLabel = kind === "smooth" ? "Прямой гладкий" : kind === "ribbed" ? "Прямой ребристый" : "Круглый";
  const sizeLabel = round ? "3″" : "2×3″";
  const bottom = ready ? "Splash Blocks" : "Ничего";
  const elbowA = ready ? 2 : kind === "ribbed" ? 3 : 0;
  const open = !!more;
  const summary = "Ещё: High Gloss White · Стена —";
  const walls = (round ? WALLS_ROUND : WALLS_RECT).map((x) => ({ key: x, label: x }));
  return (
    <Win title="Downspout № 1">
      <View style={{ flexDirection: "row", gap: 4, alignItems: "flex-start" }}>
        <Sel flex={1.9} label="Вид" value={kindLabel} />
        <Sel flex={0.95} label="Размер" value={sizeLabel} />
        <Sel flex={0.95} label="Этаж" value={`${floors} эт.`} />
      </View>
      <T v="caption" tone="mut">{floors > 1 ? `Длина ${floors * 10} ft · ${floors} эт. · ${floors} шт.` : "Длина 10 ft · 1 эт."}</T>
      {floors > 1 ? <T v="caption" tone="mut">1 эт. = 10 ft</T> : null}
      {round ? (
        <>
          <CountRow label="Elbow" value="75°" qty={ready ? 2 : 3} items={ANGLES} />
          <CountRow label="Offset" value={ready ? "2″" : "2″"} qty={ready ? 1 : 0} items={OFFS} />
        </>
      ) : (
        <>
          <CountRow label="Elbow A" value="75°" qty={elbowA} items={ANGLES} />
          <CountRow label="Elbow B" value="75°" qty={0} items={ANGLES} />
          <CountRow label="Offset A" value="2″" qty={ready ? 1 : 0} items={OFFS} />
          <CountRow label="Offset B" value="2″" qty={0} items={OFFS} />
        </>
      )}
      <SelectField label="Низ" value={bottom} items={BOTTOMS.map((x) => ({ key: x, label: x }))} onChange={() => {}} />
      <SelectField label="Верх" value="Ничего" items={TOPS.map((x) => ({ key: x, label: x }))} onChange={() => {}} />
      <Collapsible testID="more" open={open} title={open ? "Ещё" : summary}>
        <View style={{ gap: space[3] }}>
          <Sel inside label="Цвет" value="High Gloss White" swatch={hexOf("High Gloss White")} />
          <SelectField label="Стена" value={null} placeholder="—" items={[{ key: "wood", label: "Дерево" }]} onChange={() => {}} />
          <SelectField label="Крепление к стене" value={null} placeholder="—" items={walls} onChange={() => {}} />
          <T v="caption" tone="mut">Крепление к стене не выбрано — в смету не входит</T>
          <SelectField label="Своя высота" value="По этажу" items={[{ key: "По этажу", label: "По этажу" }]} onChange={() => {}} />
          {round ? <ToggleRow label="Round Wire Strainer" value={false} onChange={() => {}} /> : null}
          {kind === "ribbed" ? <ToggleRow label="Cutoff with Diverter" value={false} onChange={() => {}} /> : null}
        </View>
      </Collapsible>
    </Win>
  );
}

/* ---------- colour window ---------- */
function ColorWin({ empty }: { empty?: boolean }) {
  const { c } = useTheme();
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 300); return () => clearTimeout(id); }, []);
  const sw = (hex: string) => <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: hex, borderWidth: 1, borderColor: c.bd }} />;
  const none = (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.mut, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ width: 28, height: 1.5, backgroundColor: c.mut, transform: [{ rotate: "-45deg" }] }} />
    </View>
  );
  const tick = <Icon name="check" s={size.iconMd} color={c.ink} />;
  return (
    <Sheet visible={on} onClose={() => {}} title="Цвет" height="large">
      <View style={{ gap: space[3], paddingBottom: space[4] }}>
        <ListGroup>
          {empty ? null : <ListRow title="Как у gutter (High Gloss White)" left={sw(hexOf("High Gloss White"))} right={tick} chevron={false} onPress={() => {}} selected />}
          <ListRow title="Без покраски" left={none} chevron={false} onPress={() => {}} />
        </ListGroup>
        <ListGroup>
          {COLORS.map((x) => (
            <ListRow key={x.key} title={x.label} left={sw(x.hex)} chevron={false} onPress={() => {}} />
          ))}
        </ListGroup>
      </View>
    </Sheet>
  );
}

/* ---------- menus over the downspout window ---------- */
function MenuOver({ items, title, anchor, children }: { items: { key: string; label: string; selected?: boolean }[]; title: string; anchor: { x: number; y: number; w: number; h: number }; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 1100); return () => clearTimeout(id); }, []);
  return (
    <>
      {children}
      <Menu visible={on} anchor={anchor} items={items} onSelect={() => {}} onClose={() => {}} title={title} matchWidth />
    </>
  );
}

const wallItems = (round?: boolean) => (round ? WALLS_ROUND : WALLS_RECT).map((x, k) => ({ key: x, label: x, selected: k === 0 }));
/* ---------- the `was` frames: the real current panels ---------- */
function Was({ kind }: { kind: "g" | "d" }) {
  const { t } = useI18n();
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 300); return () => clearTimeout(id); }, []);
  const ch = MODULE_CHOICES;
  return (
    <Sheet visible={on} onClose={() => {}} title={kind === "g" ? t("mod.gutters.attr.run") : t("mod.gutters.attr.ds")} height="large">
      <AttrBody inSheet>
        {kind === "g" ? (
          <RunAttrsView run={{ id: "n", a: [0, 0], b: [0, 0], attrs: runFor(ch, 1) }} onAttrs={() => {}} onLength={() => {}} ch={ch} compact />
        ) : (
          <DsAttrsView ds={{ ...dsFor(ch), id: "d", runId: "", atIn: 0 }} onAttrs={() => {}} ch={ch} compact />
        )}
      </AttrBody>
    </Sheet>
  );
}

export default function MockQ10() {
  const { c } = useTheme();
  const { v = "g-new" } = useLocalSearchParams<{ v?: string }>();
  let body: ReactNode = null;
  switch (v) {
    case "was-g": body = <Was kind="g" />; break;
    case "was-d": body = <Was kind="d" />; break;
    case "g-new": body = <Gutter />; break;
    case "g-ready": body = <Gutter ready />; break;
    case "g-ready-more": body = <Gutter ready more />; break;
    case "g-mm": body = <Gutter mm />; break;
    case "ds-new-smooth": body = <Downspout kind="smooth" />; break;
    case "ds-new-smooth-more": body = <Downspout kind="smooth" more />; break;
    case "ds-new-ribbed": body = <Downspout kind="ribbed" />; break;
    case "ds-new-ribbed-more": body = <Downspout kind="ribbed" more />; break;
    case "ds-new-round": body = <Downspout kind="round" />; break;
    case "ds-new-round-more": body = <Downspout kind="round" more />; break;
    case "ds-ready": body = <Downspout kind="smooth" ready />; break;
    case "ds-ready-more": body = <Downspout kind="smooth" ready more />; break;
    case "menu-angle":
      body = <MenuOver title="Elbow A" anchor={{ x: 107, y: 201, w: 115, h: 44 }} items={ANGLES.map((x) => ({ ...x, selected: x.key === "75°" }))}><Downspout kind="smooth" ready /></MenuOver>;
      break;
    case "menu-offset":
      body = <MenuOver title="Offset A" anchor={{ x: 107, y: 313, w: 115, h: 44 }} items={OFFS.map((x) => ({ ...x, selected: x.key === "2″" }))}><Downspout kind="smooth" ready /></MenuOver>;
      break;
    case "menu-wall":
      body = <MenuOver title="Крепление к стене" anchor={{ x: 17, y: 716, w: 356, h: 40 }} items={wallItems()}><Downspout kind="smooth" ready more /></MenuOver>;
      break;
    case "menu-wall-round":
      body = <MenuOver title="Крепление к стене" anchor={{ x: 17, y: 716, w: 356, h: 40 }} items={wallItems(true)}><Downspout kind="round" ready more /></MenuOver>;
      break;
    case "menu-bottom":
      body = <MenuOver title="Низ" anchor={{ x: 17, y: 425, w: 356, h: 44 }} items={BOTTOMS.map((x, k) => ({ key: x, label: x, selected: k === 1 }))}><Downspout kind="smooth" ready /></MenuOver>;
      break;
    case "menu-top":
      body = <MenuOver title="Верх" anchor={{ x: 17, y: 481, w: 356, h: 44 }} items={TOPS.map((x, k) => ({ key: x, label: x, selected: k === 0 }))}><Downspout kind="smooth" ready /></MenuOver>;
      break;
    case "ds-new-2floor": body = <Downspout kind="smooth" floors={2} />; break;
    case "menu-color-empty": body = <ColorWin empty />; break;
    case "menu-color": body = <ColorWin />; break;
  }
  return <View style={{ flex: 1, backgroundColor: c.bg }}>{body}</View>;
}
