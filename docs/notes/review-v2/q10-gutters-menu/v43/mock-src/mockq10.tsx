/** TEMPORARY mock for #2412 circle 4 (not committed): Gutter / Downspout windows on the real src/ui components. `?v=<view>` */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";
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

/* ---------- the one field look of a window (circle 4.3): label above, box, value, ⌄ = a menu opens, › = a list page opens ---------- */
function Sel({ label, value, swatch, placeholder = "—", flex = 1, error, page, bare, still }: { label: string; value?: string; swatch?: string; placeholder?: string; flex?: number; error?: boolean; page?: boolean; bare?: boolean; still?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex, minWidth: 0, gap: space[1] }}>
      {bare ? null : <T v="micro" tone="mut">{label}</T>}
      <Press visibleHeight={size.fieldPhone} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: size.fieldPhone, flexDirection: "row", alignItems: "center", gap: space[1], paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.field, borderWidth: component.hairline, borderColor: error ? c.status.warn.fill : c.bdField, backgroundColor: c.in }}>
        {swatch ? <Swatch hex={swatch} s={18} /> : null}
        <T v="body" tone={value ? "ink" : "mut"} numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>{value ?? placeholder}</T>
        {still ? null : <Icon name={page ? "chevronRight" : "chevronDown"} s={size.iconSm} color={c.mut} />}
      </Press>
    </View>
  );
}
function Swatch({ hex, s = 24 }: { hex: string; s?: number }) {
  const { c } = useTheme();
  return <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: hex, borderWidth: 1.5, borderColor: c.mut }} />;
}

/** the value menu (circle 4.3, council: A): at the field, its right edge on the field's, as wide as its words (240…280),
 *  6 below the field (above it when there is no room), no title, «Ничего» its own group, the chosen — check on the left + 600 */
function PopField({ label, value, items, open, bare, flex, placeholder }: { label: string; value?: string; items: string[]; open?: boolean; bare?: boolean; flex?: number; placeholder?: string }) {
  const { c } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const ref = useRef<any>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y: y + h - size.fieldPhone, w })), 1600);
    return () => clearTimeout(id);
  }, [open]);
  const longest = Math.max(...items.map((x) => x.length));
  const w = Math.min(280, Math.max(component.menuW, longest * 9 + 72));
  const groupNone = items[0] === "Ничего";
  const h = items.length * size.hitMin + space[1] * 2 + (groupNone ? space[2] : 0);
  const below = at ? at.y + size.fieldPhone + 6 : 0;
  const top = at && below + h > winH - 100 ? at.y - 6 - h : below;
  return (
    <View ref={ref} style={{ flex, minWidth: 0 }}>
      <Sel label={label} value={value} bare={bare} placeholder={placeholder} />
      {open && at ? (
        <Modal transparent visible animationType="none">
          <View style={{ position: "absolute", left: at.w >= w ? at.x + at.w - w : Math.max(space[4], Math.min(at.x, winW - space[4] - w)), top, width: w, borderRadius: radius.inner, backgroundColor: c.blurTint === "dark" ? c.surf3 : c.surf, borderWidth: component.hairline, borderColor: c.bd, paddingVertical: space[1], shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
            {items.map((x, i) => (
              <View key={x}>
                {groupNone && i === 1 ? <View style={{ height: component.hairline, backgroundColor: c.bd, marginVertical: space[1] }} /> : null}
                <View style={{ minHeight: size.hitMin, flexDirection: "row", alignItems: "center", paddingLeft: space[3], paddingRight: space[4] }}>
                  <View style={{ width: 28 }}>{x === value ? <Icon name="check" s={size.iconMd} color={c.ink} /> : null}</View>
                  <T v="body" w={x === value ? "semibold" : undefined} numberOfLines={1}>{x}</T>
                </View>
              </View>
            ))}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** mock: an option row in a grouped card with its inner padding (in code — OptionRow / PickerSheet rows) */
function PadRow(p: Parameters<typeof ListRow>[0]) {
  return <View style={{ paddingHorizontal: space[4] }}><ListRow {...p} /></View>;
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

/** «Elbow A · 75° ⌄ · − n +» in one line; the value box opens the same value menu */
function CountRow({ label, value, qty, items, open }: { label: string; value: string; qty: number; items: string[]; open?: boolean }) {
  const [n, setN] = useState(qty);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
      <View style={{ width: 70 }}><T v="body" w="semibold" numberOfLines={1}>{label}</T></View>
      <PopField bare label={label} value={value} items={items} open={open} flex={1} />
      <View style={{ flexShrink: 0 }}>
        <Stepper label="" value={n} min={0} max={12} onChange={setN} />
      </View>
    </View>
  );
}
const ANGLES = ["30°", "45°", "60°", "75°", "90°"];
const OFFS = ["1″", "2″", "4″", "Свой…"];

/* ---------- the tape: standard US, 1″ across the window ---------- */
const LEN = [54, 44, 34, 24, 16, 10];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const fracText = (n32: number) => {
  const g = gcd(n32, 32);
  return { n: n32 / g, d: 32 / g };
};
const NEEDLE = "#FF3B30"; // mock: the future token tape.needle (5th exception of rule 2, founder 23.11 05:10)
function Ruler({ n32, mark = "a" }: { n32: number; mark?: "a" | "b" | "old" }) {
  const { c } = useTheme();
  const [w, setW] = useState(342);
  const v = n32 / 32;
  const H = mark === "a" ? 104 : 102;
  const els: ReactNode[] = [];
  const k0 = Math.floor((v - 0.56) * 32);
  const k1 = Math.ceil((v + 0.56) * 32);
  const cx = w / 2;
  const text = n32 === 0 ? "0″" : `${fracText(n32).n}/${fracText(n32).d}″`;
  for (let k = k0; k <= k1; k++) {
    const x = w / 2 + (k / 32 - v) * w;
    const m = ((k % 32) + 32) % 32;
    const lvl = m === 0 ? 0 : m === 16 ? 1 : m % 8 === 0 ? 2 : m % 4 === 0 ? 3 : m % 2 === 0 ? 4 : 5;
    const len = LEN[lvl]!;
    const near = Math.abs(x - cx);
    els.push(<Line key={`t${k}`} x1={x} x2={x} y1={0} y2={len} stroke={c.ink} strokeWidth={lvl === 0 ? 1.8 : lvl === 1 ? 1.4 : 1} opacity={lvl >= 4 ? 0.8 : 1} />);
    // A: the chosen value takes the place of the labels under the needle; B: the labels next to the needle step back
    if (mark === "a" && near < 30) continue;
    if (mark === "b" && near < 1) continue;
    const pale = mark === "b" && near < 26;
    const fade = 1;
    const ink = pale ? c.mut : c.ink;
    if (lvl <= 4) {
      if (lvl === 0) {
        els.push(<SvgText key={`l${k}`} x={x} y={len + 17} fill={ink} fontSize={15} fontFamily={font.families.bold} textAnchor="middle" opacity={fade}>{`${Math.floor(k / 32)}″`}</SvgText>);
      } else {
        const { n, d } = fracText(m);
        const fs = lvl === 1 ? 12 : 11;
        const y = len + fs + 1;
        els.push(<SvgText key={`n${k}`} x={x} y={y} fill={ink} fontSize={fs} fontFamily={font.families.semibold} textAnchor="middle" opacity={fade}>{String(n)}</SvgText>);
        els.push(<Line key={`b${k}`} x1={x - fs * 0.6} x2={x + fs * 0.6} y1={y + 2.5} y2={y + 2.5} stroke={ink} strokeWidth={0.8} opacity={fade} />);
        els.push(<SvgText key={`d${k}`} x={x} y={y + fs + 3} fill={ink} fontSize={fs} fontFamily={font.families.semibold} textAnchor="middle" opacity={fade}>{String(d)}</SvgText>);
      }
    }
  }
  const tri = (y: number, down: boolean) => `M${cx - 6},${y} L${cx + 6},${y} L${cx},${down ? y + 8 : y - 8} Z`;
  if (mark === "a") {
    // A «стрелка и значение на месте цифры»: the needle runs over the chosen tick only, from a notch at the top edge
    // down to where the labels start; the chosen value stands on the yellow pill in the labels' row, in place of its label
    const pillW = Math.max(52, text.length * 10 + 20);
    const ly = 58; // labels' row of the needle: just under the longest neighbour tick (½″ = 44)
    return (
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: "stretch", height: H, borderRadius: radius.field, backgroundColor: c.surf2, overflow: "hidden" }}>
        <Svg width={w} height={H}>
          {els}
          <Line x1={cx} x2={cx} y1={0} y2={ly - 6} stroke={NEEDLE} strokeWidth={2.5} />
          <Path d={tri(0, true)} fill={NEEDLE} />
          <Rect x={cx - pillW / 2} y={ly - 4} width={pillW} height={30} rx={15} fill={c.tape.markFill} />
          <SvgText x={cx} y={ly + 16} fill={c.tape.markText} fontSize={16} fontFamily={font.families.bold} textAnchor="middle">{text}</SvgText>
        </Svg>
      </View>
    );
  }
  if (mark === "b") {
    // B «линия во всю высоту»: the needle crosses the whole tape (notches at both edges), the labels near it go pale;
    // the value is on the pill under the tape, in line with the needle
    return (
      <View style={{ alignItems: "center", gap: space[1] }}>
        <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: "stretch", height: H, borderRadius: radius.field, backgroundColor: c.surf2, overflow: "hidden" }}>
          <Svg width={w} height={H}>
            {els}
            <Line x1={cx} x2={cx} y1={0} y2={H} stroke={NEEDLE} strokeWidth={2.5} />
            <Path d={tri(0, true)} fill={NEEDLE} />
            <Path d={tri(H, false)} fill={NEEDLE} />
          </Svg>
        </View>
        <View style={{ paddingHorizontal: space[4], height: 30, minWidth: 56, borderRadius: radius.pill, backgroundColor: c.tape.markFill, alignItems: "center", justifyContent: "center" }}>
          <T v="button" style={{ color: c.tape.markText }}>{text}</T>
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignItems: "center" }}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: "stretch", height: H, borderRadius: radius.field, backgroundColor: c.surf2, overflow: "hidden" }}>
        <Svg width={w} height={H}>
          {els}
          <Line x1={w / 2} x2={w / 2} y1={H - 22} y2={H} stroke={NEEDLE} strokeWidth={3} strokeLinecap="round" />
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
      <View style={{ gap: space[3], paddingBottom: space[8] }}>{children}</View>
    </Sheet>
  );
}

const UNITS = [{ key: "in", label: "ft · in · дробь" }, { key: "mm", label: "мм" }];
const FRACS = ["0", "1/32", "1/16", "3/32", "1/8", "5/32", "3/16", "7/32", "1/4", "5/16", "3/8", "1/2"];

/* ---------- Gutter ---------- */
const MOUNTS = ["Hidden Hanger", "Hidden Hanger with Screw", "Heavy Duty Hidden Hanger", "#40 Fascia Hanger with Snap Strap", "#41 Rafter Hanger with Snap Strap", "Wrap Around Hanger", "Premium Fascia Hanger with Crossbar", "Custom Crossbar Hanger"];
/** the one colour field: the same in Gutter and Downspout (swatch + name + ›, opens the colour page) */
function ColorField({ value, error, placeholder = "Выберите", flex }: { value?: string; error?: boolean; placeholder?: string; flex?: number }) {
  const name = value?.replace("Как у gutter · ", "");
  return <Sel flex={flex} page label="Цвет" value={value} placeholder={placeholder} error={error} swatch={name ? hexOf(name) : undefined} />;
}
function Gutter({ ready, more, mm, mark = "b" }: { ready?: boolean; more?: boolean; mm?: boolean; mark?: "a" | "b" | "old" }) {
  const [u, setU] = useState<string>(mm ? "mm" : "in");
  const frac = ready ? 10 : 0; // 32nds: 10 → 5/16
  const lenText = u === "mm" ? "3,810 мм · 12′ 6″" : ready ? "12′ 6 5/16″" : "12′ 6″";
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
            <TextField type="number" value="3,810" onChangeText={() => {}} suffix="мм" label="Длина, мм" />
          </View>
          <T v="caption" tone="mut">Рулетка — только дюймы</T>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space[2], alignItems: "flex-start" }}>
            <View style={{ flex: 1, gap: space[1] }}><T v="micro" tone="mut">Футы</T><TextField type="number" value="12" onChangeText={() => {}} suffix="ft" label="Футы" /></View>
            <View style={{ flex: 1, gap: space[1] }}><T v="micro" tone="mut">Дюймы</T><TextField type="number" value="6" onChangeText={() => {}} suffix="in" label="Дюймы" /></View>
            <Sel still flex={1.05} label="Дробь" value={ready ? "5/16″" : "0″"} />
          </View>
          <Ruler n32={frac} mark={mark} />
        </>
      )}
      <View style={{ flexDirection: "row", gap: space[1], alignItems: "flex-start" }}>
        <PopField flex={0.8} label="Размер" value="5″" items={["5″", "6″"]} />
        <ColorField flex={2} value={color} error={!color} />
        <PopField flex={0.9} label="Этаж" value="1 эт." items={["1 эт.", "2 эт.", "3 эт."]} />
      </View>
      {ready ? <T v="caption" tone="mut">Цвет — один на весь замер</T> : <Warn>Выберите цвет — он один на весь замер</Warn>}
      <PopField label="Профиль" value="K" items={["K"]} />
      <Collapsible testID="more" open={open} title={open ? "Ещё" : mount ? `Ещё: ${mount}` : "Ещё: ⚠ Крепление не выбрано"}>
        <View style={{ gap: space[3] }}>
          <Sel page label="Крепление" value={mount} placeholder="Выберите" error={!mount} />
          {mount ? null : <Warn>Выберите крепление</Warn>}
          <PopField label="Материал" value="Алюминий" items={["Алюминий"]} />
          <PopField label="Толщина" value=".027″" items={[".027″"]} />
          <Sel label="Край крыши" placeholder="Не задан" />
        </View>
      </Collapsible>
    </Win>
  );
}

/* ---------- Downspout ---------- */
type Kind = "smooth" | "ribbed" | "round";
const BOTTOMS = ["Ничего", "Splash Blocks", "Flex-A-Spout", "В землю", "На нижнюю крышу"];
const TOPS = ["Ничего", "Funnel", "Square Corrugated “Y” Funnel", "#14 Ornate Conductor Head, Soldered", "Plain Tapered Conductor Head, Riveted", "Molded Universal Conductor Head"];
const WALLS_RECT = ["Universal Band", "Square Stamped Sickle Hook", "Heavy Duty Channel Brick Hook", "Metco Ornamental Conductor Band", "U-Bracket Downspout Hanger", "Conductor Bracket Downspout Hanger", "Sq. Side Fasten / Wire Downspout Hooks"];
const topsFor = (kind: string) => (kind === "ribbed" ? TOPS : TOPS.filter((x) => !x.includes("“Y”")));
const WALLS_ROUND = ["Stamped Plain Round Sickle Hook", "Heavy Duty Channel Brick Hook", "Hinged Downspout Hook – Plain Round", "Hinged Downspout Hook – Round Corrugated", "#31 Pipe Cleat"];
type Open = "bottom" | "angle" | "offset" | "wallKind" | undefined;
function Downspout({ kind, ready, more, floors = 1, gcolor = "set", open }: { kind: Kind; ready?: boolean; more?: boolean; floors?: number; gcolor?: "set" | "none"; open?: Open }) {
  const round = kind === "round";
  const kindLabel = kind === "smooth" ? "Прямой гладкий" : kind === "ribbed" ? "Прямой ребристый" : "Круглый";
  const sizeLabel = round ? "3″" : "2×3″";
  const bottom = ready ? "Splash Blocks" : "Ничего";
  const elbowA = ready ? 2 : kind === "ribbed" ? 3 : 0;
  const isOpen = !!more;
  return (
    <Win title="Downspout № 1">
      <View style={{ flexDirection: "row", gap: space[1], alignItems: "flex-start" }}>
        <PopField flex={2.2} label="Вид" value={kindLabel} items={["Прямой гладкий", "Прямой ребристый", "Круглый"]} />
        <PopField flex={0.85} label="Размер" value={sizeLabel} items={[sizeLabel]} />
        <PopField flex={0.85} label="Этаж" value={`${floors} эт.`} items={["1 эт.", "2 эт.", "3 эт."]} />
      </View>
      <T v="caption" tone="mut">{floors > 1 ? `Длина ${floors * 10} ft — ${floors} шт. по 10 ft` : "Длина 10 ft · 1 эт."}</T>
      {round ? (
        <>
          <CountRow label="Elbow" value="75°" qty={ready ? 2 : 3} items={ANGLES} open={open === "angle"} />
          <CountRow label="Offset" value="2″" qty={ready ? 1 : 0} items={OFFS} open={open === "offset"} />
        </>
      ) : (
        <>
          <CountRow label="Elbow A" value="75°" qty={elbowA} items={ANGLES} open={open === "angle"} />
          <CountRow label="Elbow B" value="75°" qty={0} items={ANGLES} />
          <CountRow label="Offset A" value="2″" qty={ready ? 1 : 0} items={OFFS} open={open === "offset"} />
          <CountRow label="Offset B" value="2″" qty={0} items={OFFS} />
        </>
      )}
      <PopField label="Низ" value={bottom} items={BOTTOMS} open={open === "bottom"} />
      <Sel page label="Верх" value="Ничего" />
      <Collapsible testID="more" open={isOpen} title={isOpen ? "Ещё" : "Ещё: ⚠ Крепление не выбрано"}>
        <View style={{ gap: space[3] }}>
          {gcolor === "set" ? <ColorField value="Как у gutter · High Gloss White" /> : <><ColorField error /><Warn>У gutter цвет не задан — задайте его в окне Gutter</Warn></>}
          <PopField label="Стена" placeholder="Выберите" items={["Дерево", "Кирпич", "Сайдинг", "Штукатурка"]} open={open === "wallKind"} />
          <Sel page label="Крепление к стене" placeholder="Выберите" error />
          <Warn>Выберите крепление к стене</Warn>
          <View style={{ gap: space[1] }}><T v="micro" tone="mut">Своя высота</T><TextField type="number" value="" placeholder="Не задана" onChangeText={() => {}} suffix="ft" label="Своя высота" /></View>
          {round ? <ToggleRow label="Round Wire Strainer" value={false} onChange={() => {}} /> : null}
          {kind === "ribbed" ? <ToggleRow label="Cutoff with Diverter" value={false} onChange={() => {}} /> : null}
        </View>
      </Collapsible>
    </Win>
  );
}

/* ---------- the list page inside the window (council: SheetPage, «‹» back, no sheet over the sheet) ---------- */
function Thumb() {
  const { c } = useTheme();
  // mock: the part's photo from the catalogue (Berger chart) stands here; a neutral tile until the photos are in
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.tip, backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
      <Icon name="image" s={size.iconSm} color={c.mut} />
    </View>
  );
}
function Page({ title, children }: { title: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 300); return () => clearTimeout(id); }, []);
  return (
    <Sheet visible={on} onClose={() => {}} title={title} height="large" hideClose onBack={() => {}}>
      <View style={{ gap: space[3], paddingBottom: space[4] }}>{children}</View>
    </Sheet>
  );
}
function ListPage({ title, items, chosen, none, thumbs = true }: { title: string; items: string[]; chosen?: string; none?: boolean; thumbs?: boolean }) {
  const { c } = useTheme();
  const tick = <Icon name="check" s={size.iconMd} color={c.ink} />;
  const rows = none ? items.filter((x) => x !== "Ничего") : items;
  return (
    <Page title={title}>
      {none ? (
        <ListGroup>
          <PadRow title="Ничего" chevron={false} onPress={() => {}} selected={chosen === "Ничего"} right={chosen === "Ничего" ? tick : undefined} />
        </ListGroup>
      ) : null}
      <ListGroup>
        {rows.map((x) => <PadRow key={x} title={x} lines={2} left={thumbs ? <Thumb /> : undefined} chevron={false} onPress={() => {}} selected={x === chosen} right={x === chosen ? tick : undefined} />)}
      </ListGroup>
    </Page>
  );
}
function ColorPage({ empty }: { empty?: boolean }) {
  const { c } = useTheme();
  const none = (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.mut, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ width: 28, height: 1.5, backgroundColor: c.mut, transform: [{ rotate: "-45deg" }] }} />
    </View>
  );
  const tick = <Icon name="check" s={size.iconMd} color={c.ink} />;
  return (
    <Page title="Цвет">
      <ListGroup>
        {empty ? null : <PadRow title="Как у gutter · High Gloss White" left={<Swatch hex={hexOf("High Gloss White")} />} right={tick} chevron={false} onPress={() => {}} selected />}
        <PadRow title="Без покраски" left={none} chevron={false} onPress={() => {}} />
      </ListGroup>
      <ListGroup>
        {COLORS.map((x) => <PadRow key={x.key} title={x.label} left={<Swatch hex={x.hex} />} chevron={false} onPress={() => {}} />)}
      </ListGroup>
    </Page>
  );
}

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

/* ---------- v42 menus kept for the «было» frames of circle 4.3 ---------- */
function OldMenu({ items, title, anchor, children }: { items: { key: string; label: string; selected?: boolean }[]; title: string; anchor: { x: number; y: number; w: number; h: number }; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setOn(true), 1100); return () => clearTimeout(id); }, []);
  return (
    <>
      {children}
      <Menu visible={on} anchor={anchor} items={items} onSelect={() => {}} onClose={() => {}} title={title} matchWidth />
    </>
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
    case "g-ready-tapeA": body = <Gutter ready mark="a" />; break;
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
    case "ds-new-2floor": body = <Downspout kind="smooth" floors={2} />; break;
    case "ds-color-empty": body = <Downspout kind="smooth" more gcolor="none" />; break;
    case "ds-color-set": body = <Downspout kind="smooth" more />; break;
    case "menu-bottom": body = <Downspout kind="smooth" ready open="bottom" />; break;
    case "menu-angle": body = <Downspout kind="smooth" ready open="angle" />; break;
    case "menu-offset": body = <Downspout kind="smooth" ready open="offset" />; break;
    case "menu-wallkind": body = <Downspout kind="smooth" ready more open="wallKind" />; break;
    case "menu-bottom-old":
      body = <OldMenu title="Низ" anchor={{ x: 17, y: 425, w: 356, h: 44 }} items={BOTTOMS.map((x, k) => ({ key: x, label: x, selected: k === 1 }))}><Downspout kind="smooth" ready /></OldMenu>;
      break;
    case "page-wall": body = <ListPage title="Крепление к стене" items={WALLS_RECT} />; break;
    case "page-wall-round": body = <ListPage title="Крепление к стене" items={WALLS_ROUND} />; break;
    case "page-top": body = <ListPage title="Верх" items={topsFor("smooth")} chosen="Ничего" none />; break;
    case "page-top-round": body = <ListPage title="Верх" items={topsFor("round")} chosen="Ничего" none />; break;
    case "page-mount-g": body = <ListPage title="Крепление" items={MOUNTS} chosen="Hidden Hanger with Screw" />; break;
    case "page-color": body = <ColorPage />; break;
    case "page-color-empty": body = <ColorPage empty />; break;
  }
  return <View style={{ flex: 1, backgroundColor: c.bg }}>{body}</View>;
}
