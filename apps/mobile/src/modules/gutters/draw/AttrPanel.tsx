/**
 * The attribute panel of the canvas (docs/specs/33-gutters-screens.md П21.8 M5c): what the picked run or downspout
 * is made of. One component: on 390 it sits in the core's Sheet, on 820/1280 it is the column on the right of the
 * canvas. Every choice is one edit of the drawing at once (the canvas's «Назад» takes it back, saved 1 s later) —
 * no «Save» button, like the storey. The tape: feet + inches, «Применить» → confidence `taped` (icon + word, rule 2).
 * Colours are words, never swatches (rule 2). The lists are what the company installs and its palette (settings, M7b);
 * an element's own value the company no longer offers stays as one more chip «нет в списке» (spec 33 П22.2 №7).
 */
import { useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, useWindowDimensions, View } from "react-native";
import { measureAfterKeyboard } from "./afterKeyboard";
import { component, radius, size as sizes, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, StatusChip, Stepper, TextField, Toggle } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu } from "@/ui/overlays";
import { fillStyle } from "@/ui/fill";
import { SelectedCheck } from "@/ui/selectedCheck";
import { RowView } from "@/ui/surfaces";
import { COLORS, DS_HEADS, DS_KINDS, dsKindOf, DS_SHAPES, smallerSizes, elbowCounts, withElbowQty, OFFSETS_IN, hangerKitsFor, MILL_ONLY, MOUNTS, MAX_RUN_IN, oneIn, tapeIn, unitFields, wallKitsFor, wallOf, WALLS, withCurrent, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { MODULE_CHOICES, type Choices } from "../settings";
import { FracPicker } from "./FracPicker";
import { inchesComplete, inchesTooBig, nextStage, type EntryStage } from "./lengthEntry";
import { MM_SCALE, SIXTEENTHS_SCALE, SIXTEENTHS_SCALE_IN, Tape as TapeStrip } from "./Tape";
import { DENOM, fmtLen, fracLabel, LEN_UNITS, MM_OF, MM_PER_IN, type LenFormat, type LenUnit } from "../canvas/format";
import { storyOf } from "../canvas/scene";
import { drawnLengthIn, type CornerChoice, type DrawnDownspout, type DrawnRun, type FoundCorner } from "../geometry";

const k = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
const dsSize = (s: string) => (s.includes("x") ? s.replace("x", "×") : inch(s));
const elbow = (s: string) => (/^\d+$/.test(s) ? `${s}°` : s);

/** a colour: the module's own words are translated; the company's palette names are its supplier's words (data) */
export function useColorLabel() {
  const { t } = useI18n();
  return (c: string) => ((COLORS as readonly string[]).includes(c) ? t(k(`c.${c}`)) : c);
}

/** a switch with its words beside it (the core's Toggle carries the words for screen readers only) */
function Switch({ label, on, onChange, testID }: { label: string; on: boolean; onChange: (v: boolean) => void; testID: string }) {
  return (
    <RowView style={{ gap: space[3], justifyContent: "space-between" }}>
      <T v="body" style={{ flex: 1 }}>{label}</T>
      <View testID={testID}><Toggle on={on} onChange={onChange} label={label} /></View>
    </RowView>
  );
}

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{label}</T>
      {children}
    </View>
  );
}

/** a choice of words: the stored value and its label */
function Pick<K extends string>({ label, testID, items, value, onChange, offered }: { label: string; testID: string; items: { key: K; label: string }[]; value: K; onChange: (v: K) => void; offered?: readonly string[] }) {
  const { t } = useI18n();
  // the element's own value the company does not install any more: shown, marked by a word (not by colour, rule 2)
  const off = (it: { key: K; label: string }) => (offered && !offered.includes(it.key) ? { ...it, label: `${it.label} · ${t(k("notOffered"))}` } : it);
  return (
    <Field label={label} testID={testID}>
      <ChoiceChips items={items.map(off)} value={value} onChange={onChange} />
    </Field>
  );
}

/** the fraction typed by the tape, beside the inches: ⅜, 3/16 (nothing at 0) */
function FracText({ value, testID }: { value: number; testID: string }) {
  return value ? <View testID={testID}><T v="title" w="semibold">{fracLabel(value)}</T></View> : null;
}
/**
 * A tape to pull (founder 09.11: «как рулетка, бегунком проматывать длину»): it shows the length in the fields and sets
 * them — feet, inches and sixteenths — as it is dragged, to 1/16″.
 */
/** a phone window shorter than this: the strip of the tape is lower and the fraction row's padding goes (the buttons stay above the number keyboard, #1345) */
const SHORT_WINDOW = 700;
function Pull({ ft, inc, e16, onPull, testID }: { ft: string; inc: string; e16: number; onPull: (x: { ft: number; inch: number; sixteenths: number }) => void; testID: string }) {
  const { t } = useI18n();
  const short = useWindowDimensions().height < SHORT_WINDOW;
  const typed = tapeIn(ft, inc, e16);
  const last = useRef(typed ?? 12);
  if (typed !== null) last.current = typed;
  return (
    <TapeStrip
      marks={Math.round(last.current * DENOM)}
      max={Math.round(MAX_RUN_IN * DENOM)}
      scale={SIXTEENTHS_SCALE}
      readout={fmtLen(last.current, "ftin")}
      onMarks={(m) => onPull(split(m / DENOM))}
      testID={testID}
      short={short}
      label={t(k("pull"))}
      stepLabels={{ less: t(k("pullLess"), { step: "1/16″" }), more: t(k("pullMore"), { step: "1/16″" }) }}
    />
  );
}
/** the same tape for one number: inches (1/16″ marks) or metric (millimetre marks); it writes the field in its unit */
function PullOne({ one, unit, onOne, testID }: { one: string; unit: Exclude<LenUnit, "ftin">; onOne: (v: string) => void; testID: string }) {
  const { t } = useI18n();
  const short = useWindowDimensions().height < SHORT_WINDOW;
  const typed = oneIn(one, unit);
  const last = useRef(typed ?? 12);
  if (typed !== null) last.current = typed;
  const metric = unit !== "in";
  // metric: the field's own number, to the millimetre (it is kept to 1/16″ only when applied)
  const x = Number(one.replace(",", "."));
  const lastMm = useRef(Math.round(last.current * MM_PER_IN));
  if (metric && Number.isFinite(x) && x > 0) lastMm.current = Math.round(x * MM_OF[unit]);
  const mm = lastMm.current;
  return (
    <TapeStrip
      marks={metric ? mm : Math.round(last.current * DENOM)}
      max={metric ? Math.floor(MAX_RUN_IN * MM_PER_IN) : Math.round(MAX_RUN_IN * DENOM)}
      scale={metric ? MM_SCALE : SIXTEENTHS_SCALE_IN}
      readout={metric ? `${Math.round((mm / MM_OF[unit]) * 1000) / 1000} ${unit}` : fmtLen(last.current, "in")}
      onMarks={(m) => onOne(metric ? String(m / MM_OF[unit]) : String(m / DENOM))}
      testID={testID}
      short={short}
      label={t(k("pull"))}
      stepLabels={{ less: t(k("pullLess"), { step: metric ? "1 mm" : "1/16″" }), more: t(k("pullMore"), { step: metric ? "1 mm" : "1/16″" }) }}
    />
  );
}
const split = (n: number) => {
  const e = Math.round(n * DENOM);
  return { ft: Math.floor(e / 192), inch: Math.floor((e % 192) / 16), sixteenths: e % 16 };
};

/** the tape: feet and inches; «Применить» sets the length, «По рисунку» puts the drawn one back */
function Tape({ run, onLength }: { run: DrawnRun; onLength: (lengthIn: number | null) => void }) {
  const { t } = useI18n();
  const cur = run.lengthIn ?? drawnLengthIn(run);
  // the fields show the length as it is, to the sixteenth: feet, inches and sixteenths
  const f0 = unitFields(cur, "ftin");
  const [ft, setFt] = useState(f0.ft);
  const [inc, setInc] = useState(f0.inc);
  const [e16, setE16] = useState(f0.e16);
  const [bad, setBad] = useState(false);
  // another run picked, «Назад», or a dragged end: the fields show the length it has now
  useEffect(() => {
    const x = unitFields(cur, "ftin");
    setFt(x.ft);
    setInc(x.inc);
    setE16(x.e16);
    setBad(false);
  }, [run.id, cur]);
  const apply = () => {
    const n = tapeIn(ft, inc, e16);
    setBad(n === null);
    if (n !== null) onLength(n);
  };
  const taped = run.lengthIn !== undefined;
  return (
    <Field label={t(k("length"))} testID="attr-length">
      <RowView style={{ gap: space[2], flexWrap: "wrap", alignItems: "center" }}>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-ft">
          <TextField type="integer" value={ft} onChangeText={setFt} label={t(k("ft"))} onSubmit={apply} />
        </View>
        <T v="body" tone="mut">{t(k("ft"))}</T>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-in">
          <TextField type="number" value={inc} onChangeText={setInc} label={t(k("in"))} onSubmit={apply} />
        </View>
        <FracText value={e16} testID="attr-length-frac" />
        <T v="body" tone="mut">{t(k("in"))}</T>
        <View testID="attr-length-apply"><Button label={t(k("apply"))} size="sm" variant="secondary" onPress={apply} /></View>
        {taped ? <View testID="attr-length-reset"><Button label={t(k("reset"))} size="sm" variant="ghost" onPress={() => onLength(null)} /></View> : null}
      </RowView>
      <Pull ft={ft} inc={inc} e16={e16} onPull={(x) => { setFt(String(x.ft)); setInc(String(x.inch)); setE16(x.sixteenths); setBad(false); }} testID="attr-length-tape" />
      {bad ? <View testID="attr-length-bad"><StatusChip status="warn" label={t(k("badLength"))} soft /></View> : null}
    </Field>
  );
}


/**
 * The unit at the end of the number (founder 09.11, #675: «нажать на этот дюйм — выпадает окно: метры, сантиметры,
 * миллиметры… не сверху, а в конце числового поля»): the unit's word with a small arrow; a tap opens the units at it.
 */
function UnitPick({ unit, onUnit, testID }: { unit: LenUnit; onUnit: (u: LenUnit) => void; testID: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const waiting = useRef(false);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const word = unit === "ftin" || unit === "in" ? t(k("in")) : t(k(`unit.${unit}`));
  return (
    <>
      <View ref={ref} collapsable={false}>
        <Press
          testID={testID}
          onPress={() => {
            // one wait at a time: a second tap while the keyboard is going down adds no second listener
            if (waiting.current) return;
            waiting.current = true;
            measureAfterKeyboard(
              { isVisible: () => Keyboard.isVisible(), dismiss: () => Keyboard.dismiss(), onHidden: (fn) => { const s = Keyboard.addListener("keyboardDidHide", fn); return () => s.remove(); } },
              () => {
                waiting.current = false;
                ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }));
              },
              (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
            );
          }}
          visibleHeight={sizes.hitMin}
          accessibilityRole="button"
          accessibilityLabel={t(k("unitPick"), { u: t(k(`unit.${unit}`)) })}
          accessibilityState={{ expanded: !!at }}
          style={{ minHeight: sizes.hitMin, flexDirection: "row", alignItems: "center", gap: space[1] }}
        >
          <T v="body" w="semibold">{word}</T>
          <Icon name="chevronDown" s={sizes.iconSm} color={c.mut} />
        </Press>
      </View>
      <Menu
        visible={!!at}
        anchor={at}
        title={t(k("unitTitle"))}
        items={LEN_UNITS.map((u) => ({ key: u, label: t(k(`unit.${u}`)), selected: u === unit }))}
        onSelect={onUnit}
        onClose={() => setAt(null)}
      />
    </>
  );
}

/**
 * Right after a gutter is drawn (founder 08.11, 09.11): its length by hand at once. The fields hold the drawn length,
 * selected — a digit typed replaces it. Feet + inches (+ ⅛), inches alone (260″ → 21′ 8″) or mm; kept in inches.
 * «Применить» keeps what is there; «Отменить» (or a tap outside) takes the gutter away — a stray line from a zoom.
 */
export function QuickLength({ run, onLength, onDone, onCancel, start, fmt = "ftin" }: { run: DrawnRun; /** the company's format of lengths (#1092): the unit typed in starts there, «drawn» says it */ fmt?: LenFormat; onLength: (lengthIn: number) => void; onDone: () => void; onCancel: () => void; /** the length the fields start from (a label tapped: its length now); none — the drawn one */ start?: number }) {
  const { t } = useI18n();
  const drawn = start ?? drawnLengthIn(run);
  const [unit, setUnit] = useState<LenUnit>(fmt);
  // the fields start from the drawn length IN THE UNIT they open in (#1092 review Б1/Б2): in mm — the millimetres, not the
  // inches; in feet-inches — to the sixteenth
  const f0 = unitFields(drawn, fmt);
  const [ft, setFt] = useState(f0.ft);
  const [inc, setInc] = useState(f0.inc);
  const [e16, setE16] = useState(f0.e16);
  const [one, setOne] = useState(f0.one);
  const [bad, setBad] = useState(false);
  // the chain without «Done» (#1316): feet → inches → the fraction by buttons; the stage follows the focus (a tap on the inches is «in» too);
  // `inFocus` is a counter: «Далее» puts the focus into the inches AT ONCE (digits typed right after it never go into the feet)
  const [stage, setStage] = useState<EntryStage>("ft");
  const [inFocus, setInFocus] = useState(0);
  const goNext = () => {
    if (stage === "frac") return;
    if (stage === "ft") setInFocus((n) => n + 1);
    setStage(nextStage(stage));
  };
  // the length in hand, exact (#922): what the fields show, until a field is edited; a unit picked shows THIS length
  const canon = useRef(drawn);
  const edited = useRef(false);
  const typedIn = () => (unit === "ftin" ? tapeIn(ft, inc, e16) : oneIn(one, unit));
  const edit = <A,>(set: (v: A) => void) => (v: A) => {
    edited.current = true;
    set(v);
  };
  const pickUnit = (u: LenUnit) => {
    // an edited field is read first; a half-typed or empty one keeps the length it had
    const typed = edited.current ? typedIn() : canon.current;
    const n = typed ?? canon.current;
    canon.current = n;
    edited.current = false;
    setUnit(u);
    setBad(typed === null); // a wrong number typed: the length it had comes back, and it says so
    const f = unitFields(n, u);
    setFt(f.ft);
    setInc(f.inc);
    setE16(f.e16);
    setOne(f.one);
  };
  const apply = () => {
    const n = edited.current ? typedIn() : canon.current;
    setBad(n === null);
    if (n === null) return;
    if (n !== drawn) onLength(n);
    onDone();
  };
  return (
    <View testID="quick-length" style={{ gap: space[3] }}>
      <T v="heading" w="semibold">{t(k("quickTitle"))}</T>
      {unit === "ftin" ? (
        <>
          <RowView style={{ gap: space[2], flexWrap: "wrap", alignItems: "center" }}>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-ft">
              <TextField type="integer" value={ft} onChangeText={edit(setFt)} label={t(k("ft"))} onSubmit={goNext} onFocus={() => setStage("ft")} chain autoFocus selectOnFocus />
            </View>
            <T v="body" tone="mut">{t(k("ft"))}</T>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-in">
              <TextField type="number" value={inc} onChangeText={(v) => { edit(setInc)(v); const big = inchesTooBig(v); setBad(big); setStage(inchesComplete(v) && !big ? "frac" : "in"); }} label={t(k("in"))} onSubmit={stage === "frac" ? apply : goNext} onFocus={() => setStage((s0) => (s0 === "frac" ? s0 : "in"))} focusNow={inFocus} chain selectOnFocus />
            </View>
            <FracText value={e16} testID="quick-length-frac" />
            <UnitPick unit={unit} onUnit={pickUnit} testID="quick-length-unit" />
          </RowView>
          <FracPicker value={e16} onChange={(v) => { edited.current = true; setE16(v); setBad(false); }} active={stage === "frac"} testID="quick-length-fracs" />
          <Pull ft={ft} inc={inc} e16={e16} onPull={(x) => { edited.current = true; setFt(String(x.ft)); setInc(String(x.inch)); setE16(x.sixteenths); setBad(false); }} testID="quick-length-tape" />
        </>
      ) : (
        <RowView style={{ gap: space[2], alignItems: "center" }}>
          <View style={{ width: component.qtyFieldW * 2 }} testID="quick-length-one">
            <TextField type="number" value={one} onChangeText={edit(setOne)} label={t(k(`unit.${unit}`))} onSubmit={apply} autoFocus selectOnFocus />
          </View>
          <UnitPick unit={unit} onUnit={pickUnit} testID="quick-length-unit" />
        </RowView>
      )}
      {unit !== "ftin" ? <PullOne one={one} unit={unit} onOne={(v) => { edited.current = true; setOne(v); setBad(false); }} testID="quick-length-tape" /> : null}
      <T v="caption" tone="mut">{t(k("quickDrawn"), { len: fmtLen(drawn, fmt) })}</T>
      {bad ? <View testID="quick-length-bad"><StatusChip status="warn" label={t(k("badLength"))} soft /></View> : null}
      <RowView style={{ gap: space[2], justifyContent: "flex-end" }}>
        {unit === "ftin" && stage !== "frac" ? <View testID="quick-length-next"><Button label={t(k("next"))} size="sm" variant="secondary" onPress={goNext} /></View> : null}
        <View testID="quick-length-cancel"><Button label={t(k("quickCancel"))} size="sm" variant="ghost" onPress={onCancel} /></View>
        <View testID="quick-length-apply"><Button label={t(k("apply"))} size="sm" onPress={apply} /></View>
      </RowView>
    </View>
  );
}

/**
 * A choice folded into one row (founder 09.11: «выпадающее меню»): the field's name and what is picked; a tap opens the
 * choices, a pick closes them. For the long lists — the size and the colour.
 */
function Select<K extends string>({ label, testID, items, value, onChange, offered, fit }: { fit?: boolean; label: string; testID: string; items: { key: K; label: string }[]; value: K; onChange: (v: K) => void; offered?: readonly string[] }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const off = (it: { key: K; label: string }) => (offered && !offered.includes(it.key) ? { ...it, label: `${it.label} · ${t(k("notOffered"))}` } : it);
  const cur = items.find((it) => it.key === value);
  return (
    <Field label={label} testID={testID}>
      <View style={fit ? { alignSelf: "flex-start" } : undefined}>
      <Press testID={`${testID}-open`} onPress={() => setOpen((x) => !x)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}>
        <RowView style={{ justifyContent: "space-between", gap: space[2], minHeight: sizes.hitMin, paddingHorizontal: space[3], borderRadius: radius.field, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.in }}>
          <View testID={`${testID}-value`} style={fit ? undefined : { flex: 1 }}><T v="body">{cur ? off(cur).label : value}</T></View>
          <Icon name="chevronDown" s={sizes.iconSm} color={c.mut} />
        </RowView>
      </Press>
      </View>
      {open ? <ChoiceChips items={items.map(off)} value={value} onChange={(v) => { setOpen(false); onChange(v); }} /> : null}
    </Field>
  );
}

/**
 * The colour (founder 09.11): one choice — «Без покраски» is one of them (no separate painted / bare buttons: a colour
 * picked is painted). A downspout also has «Как у желоба» — its gutter's colour, the default, and it follows the gutter.
 * Copper and zinc are bare only.
 */
function ColorPick<A extends { material: string; finish?: "mill" | "painted"; color?: string }>({ a, set, ch, run }: { a: A; set: (p: Partial<A>) => void; ch: Choices; run?: { finish?: "mill" | "painted"; color?: string; material: string } }) {
  const { t } = useI18n();
  const colorLabel = useColorLabel();
  if (MILL_ONLY.has(a.material)) return null;
  const palette = withCurrent(ch.palette, a.color);
  const bare = (a.finish ?? (a.color ? "painted" : "mill")) === "mill";
  const runBare = run ? (run.finish ?? (run.color ? "painted" : "mill")) === "mill" : false;
  const sameAsRun = !!run && !MILL_ONLY.has(run.material) && (bare ? runBare : !runBare && run.color === a.color);
  const value = sameAsRun ? "@run" : bare ? "@mill" : (a.color ?? palette[0]!);
  const items = [
    ...(run && !MILL_ONLY.has(run.material) ? [{ key: "@run", label: t(k("colorAsRun"), { c: runBare ? t(k("f.mill")) : colorLabel(run.color ?? "") }) }] : []),
    { key: "@mill", label: t(k("f.mill")) },
    ...palette.map((c) => ({ key: c, label: colorLabel(c) })),
  ];
  return (
    <Select label={t(k("color"))} testID="attr-color" offered={["@run", "@mill", ...ch.palette]} items={items} value={value} onChange={(v) => {
      if (v === "@run" && run) set((runBare ? { finish: "mill" } : { finish: "painted", color: run.color }) as Partial<A>);
      else if (v === "@mill") set({ finish: "mill" } as Partial<A>);
      else set({ finish: "painted", color: v } as Partial<A>);
    }} />
  );
}

/** stock shared by runs and downspouts: material → gauge; paint → colour (copper and zinc are bare) */
function Stock<A extends { material: string; gauge?: string; finish?: "mill" | "painted"; color?: string }>({ a, set, ch, part = "all", run }: { a: A; set: (p: Partial<A>) => void; ch: Choices; /** 390 (П20.9): finish and colour on top, the rest under «Ещё» */ part?: "all" | "color" | "rest"; /** a downspout: its gutter (the colour «Как у желоба») */ run?: { finish?: "mill" | "painted"; color?: string; material: string } }) {
  const { t } = useI18n();
  const materials = withCurrent(ch.offer.materials, a.material);
  const gauges = withCurrent(ch.offer.gauges[a.material] ?? [], a.gauge);
  const mill = MILL_ONLY.has(a.material);
  const rest = part !== "color";
  const color = part !== "rest";
  return (
    <>
      {rest ? <Select label={t(k("material"))} testID="attr-material" offered={ch.offer.materials} items={materials.map((m) => ({ key: m, label: t(k(`m.${m}`)) }))} value={a.material} onChange={(material) => set({ material } as Partial<A>)} /> : null}
      {rest && gauges.length ? <Select label={t(k("gauge"))} testID="attr-gauge" offered={ch.offer.gauges[a.material]} items={gauges.map((g) => ({ key: g, label: g }))} value={a.gauge ?? gauges[0]!} onChange={(gauge) => set({ gauge } as Partial<A>)} /> : null}
      {/* the colour: one folded choice with «Без покраски» among them (founder 09.11) */}
      {color && !mill ? <ColorPick a={a} set={set} ch={ch} run={run} /> : null}
    </>
  );
}

/** a corner of the picked run and how it is made (M7c): stored on the run, else the company's default */
export interface RunCorner { found: FoundCorner; method: CornerChoice["method"]; own: boolean; /** the company's method */ def: CornerChoice["method"] }

function Corners({ corners, onCorner }: { corners: RunCorner[]; onCorner: (f: FoundCorner, m: CornerChoice["method"] | null) => void }) {
  const { t } = useI18n();
  if (!corners.length) return null;
  return (
    <Field label={t(k("corners"))} testID="attr-corners">
      {corners.map((c, i) => (
        <View key={c.found.id} style={{ gap: space[1] }} testID={`attr-corner-${i}`}>
          <T v="caption">{t(k("cornerN"), { n: i + 1, kind: t(k(`ck.${c.found.kind}`)) })}</T>
          {/* «Как у компании» — the company's method, followed when it changes; a method picked here stays (review M7c №5) */}
          <ChoiceChips
            items={[{ key: "default" as const, label: t(k("cmDefault"), { m: t(k(`cm.${c.def}`)) }) }, ...(["cut", "strip", "prefab"] as const).map((m) => ({ key: m, label: t(k(`cm.${m}`)) }))]}
            value={c.own ? c.method : "default"}
            onChange={(m) => onCorner(c.found, m === "default" ? null : m)}
          />
        </View>
      ))}
    </Field>
  );
}

/** «Ещё» (П20.9): what is changed seldom; open by itself when `open0` (a rare field is set), closed again for the next element */
function More({ open0, id, label, children }: { open0: boolean; id: string; label: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(open0);
  useEffect(() => setOpen(open0), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return <View testID="attr-more"><Button label={label} size="sm" variant="ghost" onPress={() => setOpen(true)} /></View>;
  return <View style={{ gap: space[4] }} testID="attr-more-open">{children}</View>;
}

export function RunAttrsView({
  run, onAttrs, onLength, ch = MODULE_CHOICES, corners = [], onCorner, compact,
}: { run: DrawnRun; onAttrs: (p: Partial<RunAttrs>) => void; onLength: (lengthIn: number | null) => void; ch?: Choices; corners?: RunCorner[]; onCorner?: (f: FoundCorner, m: CornerChoice["method"] | null) => void; /** 390: what is changed often on top, the rest under «Ещё» (П20.9) */ compact?: boolean; }) {
  const { t } = useI18n();
  const a = run.attrs;
  const profiles = withCurrent(ch.offer.profiles, a.profile);
  const sizes = withCurrent(ch.offer.sizes[a.profile] ?? [], a.size);
  const kits = withCurrent(hangerKitsFor(a.profile, ch), a.hanger);
  return (
    <>
      <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
        <T v="heading" w="semibold">{`${t(k("run"))} · ${fmtLen(run.lengthIn ?? drawnLengthIn(run), ch.lenFormat)}`}</T>
        {/* no «рулетка / нарисовано» per line any more: how the drawing was measured is one choice (П20.16) */}
      </RowView>
      {compact ? (
        <>
      <Pick label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />
      <Select fit label={t(k("size"))} testID="attr-size" offered={ch.offer.sizes[a.profile]} items={sizes.map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
        <Stock a={a} set={onAttrs} ch={ch} part="color" />
      <Tape run={run} onLength={onLength} />
          <More open0={false} id={run.id} label={t(k("moreRun"))}>
      <Select label={t(k("profile"))} testID="attr-profile" offered={ch.offer.profiles} items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
            <Stock a={a} set={onAttrs} ch={ch} part="rest" />
      <Pick label={t(k("mount"))} testID="attr-mount" items={MOUNTS.map((m) => ({ key: m, label: t(k(`mt.${m}`)) }))} value={a.mount ?? "fascia"} onChange={(mount) => onAttrs({ mount })} />
      <Pick label={t(k("hanger"))} testID="attr-hanger" offered={hangerKitsFor(a.profile, ch)} items={kits.map((id) => ({ key: id, label: t(k(`k.${id}`)) }))} value={a.hanger} onChange={(hanger) => onAttrs({ hanger })} />
      {onCorner ? <Corners corners={corners} onCorner={onCorner} /> : null}
          </More>
        </>
      ) : (
        <>
      <Tape run={run} onLength={onLength} />
      <Pick label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />
      <Select label={t(k("profile"))} testID="attr-profile" offered={ch.offer.profiles} items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
      <Select fit label={t(k("size"))} testID="attr-size" offered={ch.offer.sizes[a.profile]} items={sizes.map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
      <Stock a={a} set={onAttrs} ch={ch} />
      <Pick label={t(k("mount"))} testID="attr-mount" items={MOUNTS.map((m) => ({ key: m, label: t(k(`mt.${m}`)) }))} value={a.mount ?? "fascia"} onChange={(mount) => onAttrs({ mount })} />
      <Pick label={t(k("hanger"))} testID="attr-hanger" offered={hangerKitsFor(a.profile, ch)} items={kits.map((id) => ({ key: id, label: t(k(`k.${id}`)) }))} value={a.hanger} onChange={(hanger) => onAttrs({ hanger })} />
      {onCorner ? <Corners corners={corners} onCorner={onCorner} /> : null}
        </>
      )}
    </>
  );
}

/** elbows (founder 08.11): a count for every style of the shape — «A 2 шт, B 1 шт» */
function Elbows({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const counts = elbowCounts(ds);
  return (
    <Field label={t(k("elbows"))} testID="attr-elbow-qty">
      {Object.entries(counts).map(([style, qty]) => (
        <View key={style} testID={`attr-elbow-${style}`}>
          <Stepper label={elbow(style)} value={qty} min={0} max={12} onChange={(n) => onAttrs({ elbows: withElbowQty(ds, style, n) })} />
        </View>
      ))}
    </Field>
  );
}

/**
 * The kind of the downspout (#929, DESIGN-SYSTEM Б1а-style tiles): 2×2, an icon of its own and two words — shape, then
 * style. One tap sets both; the size follows the shape (changeDs). A kind whose style the company does not install shows
 * only when it is the one in hand. Picked = an ink frame, no colour (rule 2).
 */
function DsKindPick({ ds, onAttrs, ch }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch: Choices }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const cur = dsKindOf(ds.shape, ds.dsStyle);
  const shown = DS_KINDS.filter((x) => x.key === cur.key || ch.offer.dsStyles.includes(x.style));
  return (
    <Field label={t(k("dsKind"))} testID="attr-ds-kind">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }} accessibilityRole="radiogroup">
        {shown.map((x) => {
          const sel = x.key === cur.key;
          const label = t(k(`kind.${x.key}`));
          return (
            <Press
              key={x.key}
              testID={`attr-ds-kind-${x.key}`}
              onPress={() => onAttrs({ shape: x.shape, dsStyle: x.style })}
              visibleHeight={sizes.hitMin}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel, checked: sel }}
              {...({ "aria-checked": sel } as object)}
              accessibilityLabel={label.replace("\n", " ")}
              containerStyle={{ flexBasis: "47%", flexGrow: 1 }}
              style={{ minHeight: sizes.hitMin + space[4], flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.inner, ...(sel ? fillStyle(c) : { backgroundColor: "transparent" }), borderWidth: component.hairline, borderColor: sel ? "transparent" : c.bd }}
            >
              <Icon name={x.icon} s={sizes.iconMd} color={sel ? c.ink : c.mut} />
              <T v="caption" w="semibold" style={{ flex: 1, color: sel ? c.ink : c.mut }}>{label}</T>
              {/* a chosen option: «Заливка» + `check` in the corner (DS «Выделение выбранного», #1306): a card or a row carries the check */}
              {sel ? <SelectedCheck small /> : null}
            </Press>
          );
        })}
      </View>
    </Field>
  );
}

export function DsAttrsView({ ds, onAttrs, ch = MODULE_CHOICES, compact, run }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch?: Choices; compact?: boolean; /** its gutter: «Как у желоба» */ run?: DrawnRun["attrs"] }) {
  const { t } = useI18n();
  const w = wallOf(ds.shape, ds.wall);
  const sizes = withCurrent(ch.offer.dsSizes[ds.shape], ds.size);
  const bottoms = withCurrent(ch.offer.bottoms, ds.bottom.kind);
  const wallKits = withCurrent(wallKitsFor(ds.shape, w.wall, ch), w.kit);
  return (
    <>
      <T v="heading" w="semibold">{t(k("ds"))}</T>
      {compact ? (
        <>
      <Select fit label={t(k("size"))} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} items={sizes.map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
          <Stock a={ds} set={onAttrs} ch={ch} part="color" run={run} />
          <DsLength ds={ds} onAttrs={onAttrs} />
      <Elbows ds={ds} onAttrs={onAttrs} />
      <Offsets ds={ds} onAttrs={onAttrs} />
          <More open0={rareSet(ds)} id={ds.id} label={t(k("moreDs"))}>
      <DsKindPick ds={ds} onAttrs={onAttrs} ch={ch} />
            <Stock a={ds} set={onAttrs} ch={ch} part="rest" />
      <Pick label={t(k("bottom"))} testID="attr-bottom" offered={ch.offer.bottoms} items={bottoms.map((b) => ({ key: b, label: t(k(`b.${b}`)) }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Pick label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
      <Pick label={t(k("wallKit"))} testID="attr-wall-kit" offered={wallKitsFor(ds.shape, w.wall, ch)} items={wallKits.map((id) => ({ key: id, label: t(k(`wk.${id}`)) }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
            <DsRare ds={ds} onAttrs={onAttrs} />
          </More>
        </>
      ) : (
        <>
      <DsKindPick ds={ds} onAttrs={onAttrs} ch={ch} />
      <Select fit label={t(k("size"))} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} items={sizes.map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
      <Stock a={ds} set={onAttrs} ch={ch} run={run} />
      <DsLength ds={ds} onAttrs={onAttrs} />
      <Elbows ds={ds} onAttrs={onAttrs} />
      <Offsets ds={ds} onAttrs={onAttrs} />
      <Pick label={t(k("bottom"))} testID="attr-bottom" offered={ch.offer.bottoms} items={bottoms.map((b) => ({ key: b, label: t(k(`b.${b}`)) }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Pick label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
      <Pick label={t(k("wallKit"))} testID="attr-wall-kit" offered={wallKitsFor(ds.shape, w.wall, ch)} items={wallKits.map((id) => ({ key: id, label: t(k(`wk.${id}`)) }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
          <More open0={rareSet(ds)} id={ds.id} label={t(k("more"))}>
            <DsRare ds={ds} onAttrs={onAttrs} />
          </More>
        </>
      )}
    </>
  );
}

/** the downspout's length (#1276, founder 12.11: «размер, цвет и длина — выпадающими»): by the storey, or a number of feet — it was a stepper behind «Ещё» */
const DS_LENGTHS_FT = [6, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 30, 35, 40, 50, 60] as const;
function DsLength({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const cur = Math.round((ds.heightIn ?? 0) / 12);
  const fts: number[] = [...DS_LENGTHS_FT];
  if (cur && !fts.includes(cur)) fts.push(cur); // a length set before (or by the stepper of old) stays pickable
  fts.sort((x, y) => x - y);
  return (
    <Select
      fit
      label={t(k("dsLength"))}
      testID="attr-ds-length"
      items={[{ key: "0", label: t(k("heightAuto")) }, ...fts.map((n) => ({ key: String(n), label: `${n}′` }))]}
      value={String(cur)}
      onChange={(v) => onAttrs({ heightIn: Number(v) ? Number(v) * 12 : undefined })}
    />
  );
}

/**
 * Offsets (founder 09.11: the fittings in the downspout's own menu): how many, then the length — 1″ to 5″ or its own
 * (a custom part; the engine marks lengths it does not stock as custom).
 */
function Offsets({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const off = ds.offsets?.[0];
  const len = off?.lengthIn ?? OFFSETS_IN[0];
  const std = (OFFSETS_IN as readonly number[]).includes(len);
  const [own, setOwn] = useState(std ? "" : String(len));
  const [ownOpen, setOwnOpen] = useState(!std);
  const put = (lengthIn: number) => onAttrs({ offsets: [{ lengthIn, qty: off?.qty ?? 1 }] });
  return (
    <Field label={t(k("offsets"))} testID="attr-offsets">
      {/* the count makes offsets; the length is picked only once there are some (review M7c №6) */}
      <View testID="attr-offset-qty">
        <Stepper label={t(k("offsetQty"))} value={off?.qty ?? 0} min={0} max={8} onChange={(qty) => onAttrs({ offsets: qty ? [{ lengthIn: len, qty }] : undefined })} />
      </View>
      {off?.qty ? (
        <View testID="attr-offset-len" style={{ gap: space[2] }}>
          <ChoiceChips
            items={[...OFFSETS_IN.map((n) => ({ key: String(n), label: inch(String(n)) })), { key: "own", label: t(k("offsetOwn")) }]}
            value={ownOpen ? "own" : String(len)}
            onChange={(v) => {
              if (v === "own") return setOwnOpen(true);
              setOwnOpen(false);
              put(Number(v));
            }}
          />
          {ownOpen ? (
            <RowView style={{ gap: space[2] }}>
              <View style={{ width: component.qtyFieldW }} testID="attr-offset-own">
                <TextField type="number" value={own} onChangeText={setOwn} label={t(k("offsetOwn"))} onSubmit={() => { const n = Number(own); if (n > 0 && n <= 24) put(Math.round(n * DENOM) / DENOM); }} />
              </View>
              <T v="body" tone="mut">{t(k("in"))}</T>
              <View testID="attr-offset-own-apply"><Button label={t(k("apply"))} size="sm" variant="secondary" onPress={() => { const n = Number(own); if (n > 0 && n <= 24) put(Math.round(n * DENOM) / DENOM); }} /></View>
            </RowView>
          ) : null}
        </View>
      ) : null}
    </Field>
  );
}

/**
 * The rare fields of a downspout behind «Ещё» (M7c, debt of M5c №9): its own height, offsets, a size change on the way
 * down, what sits on top, a rain-barrel diverter, an outlet screen. «Ещё» opens by itself when one of them is set.
 */
const rareSet = (ds: DrawnDownspout) => !!(ds.offsets?.length || ds.reducers?.length || ds.head || ds.funnel || ds.diverter || ds.outletScreen);

function DsRare({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const head = ds.head ?? (ds.funnel ? "funnel" : "none");
  const smaller = smallerSizes(ds.shape, ds.size);
  return (
    <View style={{ gap: space[4] }}>
      <Pick label={t(k("reducer"))} testID="attr-reducer" items={[{ key: "", label: t(k("reducerNone")) }, ...smaller.map((s) => ({ key: s, label: dsSize(s) }))]} value={ds.reducers?.[0]?.to ?? ""} onChange={(to) => onAttrs({ reducers: to ? [{ to, qty: 1 }] : undefined })} />
      <Pick label={t(k("head"))} testID="attr-head" items={DS_HEADS.map((h) => ({ key: h, label: t(k(`h.${h}`)) }))} value={head} onChange={(h) => onAttrs({ head: h === "none" ? undefined : h, funnel: undefined })} />
      <Switch testID="attr-diverter" on={!!ds.diverter} onChange={(v) => onAttrs({ diverter: v || undefined })} label={t(k("diverter"))} />
      <Switch testID="attr-outlet-screen" on={!!ds.outletScreen} onChange={(v) => onAttrs({ outletScreen: v || undefined })} label={t(k("outletScreen"))} />
    </View>
  );
}

/**
 * The panel's body. In the side column (820/1280) it scrolls on its own. In the sheet (390) it does not (#745): the
 * sheet scrolls it — a list of its own inside the sheet's list took the finger, and a swipe down past the middle never
 * closed the downspout's or the gutter's sheet (the sheet's swipe runs only beside its own scroll, overlays.tsx).
 */
export function AttrBody({ children, inSheet }: { children: React.ReactNode; inSheet?: boolean }) {
  if (inSheet)
    return (
      <View style={{ gap: space[4], paddingBottom: space[4] }} testID="attr-panel">
        {children}
      </View>
    );
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }} testID="attr-panel">
      {children}
    </ScrollView>
  );
}
