/**
 * The attribute panel of the canvas (docs/specs/33-gutters-screens.md П21.8 M5c): what the picked run or downspout
 * is made of. One component: on 390 it sits in the core's Sheet, on 820/1280 it is the column on the right of the
 * canvas. Every choice is one edit of the drawing at once (the canvas's «Назад» takes it back, saved 1 s later) —
 * no «Save» button, like the storey. The tape: feet + inches, «Применить» → confidence `taped` (icon + word, rule 2).
 * A colour is its name with its sample in the one colour field (DS §9б.6, rule 2 3rd exception). The lists are what the company installs and its palette (settings, M7b);
 * an element's own value the company no longer offers stays as one more chip «нет в списке» (spec 33 П22.2 №7).
 */
import { sizeText } from "../sizeText";
import { defaultOffsetsFor } from "@octo/estimating-engine";
import { Children, useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, useWindowDimensions, View } from "react-native";
import { measureAfterKeyboard } from "./afterKeyboard";
import { component, size as sizes, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Button, StatusChip, Stepper, TextField } from "@/ui/controls";
import { Collapsible } from "@/ui/collapsible";
import type { PickerItem } from "@/ui/pickerSheet";
import { SelectField } from "@/ui/selectField";
import { ColorField } from "@/ui/colorField";
import { ToggleRow } from "@/ui/toggleRow";
import { Icon, Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu, useSheetClose } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import { COLORS, DS_HEADS, DS_KINDS, dsKindOf, DS_SHAPES, smallerSizes, boughtElbowCounts, boughtElbowPatch, OFFSETS_IN, hangerKitsFor, MILL_ONLY, MOUNTS, MAX_RUN_IN, oneIn, tapeIn, unitFields, wallKitsFor, wallOf, WALLS, withCurrent, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { MODULE_CHOICES, type Choices } from "../settings";
import { colorChoices } from "./colorChoices";
import { dsMoreSet, dsRareShown } from "./attrShown";
import { FracPicker } from "./FracPicker";
import { FRAC_SLOT } from "./fracSlot";
import { feetResetsRest, inchesComplete, inchesTooBig, nextStage, unitPickStep, type EntryStage } from "./lengthEntry";
import { MM_SCALE, SIXTEENTHS_SCALE, SIXTEENTHS_SCALE_IN, Tape as TapeStrip } from "./Tape";
import { DENOM, fmtLen, fracLabel, LEN_UNITS, MM_OF, MM_PER_IN, type LenFormat, type LenUnit } from "../canvas/format";
import { storyOf } from "../canvas/scene";
import { drawnLengthIn, type CornerChoice, type DrawnDownspout, type DrawnRun, type FoundCorner } from "../geometry";

const k = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
const dsSize = sizeText; // one format everywhere (#1916)
const elbow = (s: string) => (/^\d+$/.test(s) ? `${s}°` : s);

/** a colour: the module's own words are translated; the company's palette names are its supplier's words (data) */
export function useColorLabel() {
  const { t } = useI18n();
  return (c: string) => ((COLORS as readonly string[]).includes(c) ? t(k(`c.${c}`)) : c);
}

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{label}</T>
      {children}
    </View>
  );
}

/**
 * The fraction typed by the tape, beside the inches: ⅜, 3/16 (nothing at 0). Its place is always the widest fraction's
 * (`FRAC_SLOT`, unseen): the row keeps its size as the tape runs — it wrapped on 11/16 and back, and the tape and «Применить»
 * jumped under the finger (#2414).
 */
function FracText({ value, testID }: { value: number; testID: string }) {
  return (
    <View>
      <View style={{ opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...({ "aria-hidden": true } as object)}><T v="heading" w="semibold" tabular>{FRAC_SLOT}</T></View>
      {value ? <View testID={testID} style={{ position: "absolute", top: 0, bottom: 0, left: 0, justifyContent: "center" }}><T v="heading" w="semibold" tabular>{fracLabel(value)}</T></View> : null}
    </View>
  );
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
      readout={metric ? `${(Math.round((mm / MM_OF[unit]) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}` : fmtLen(last.current, "in")}
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
  // the inches or the fraction set by hand (typed, a fraction, the tape) in this window: the feet never wipe them (#2434)
  const restTouched = useRef(false);
  const typedIn = () => (unit === "ftin" ? tapeIn(ft, inc, e16) : oneIn(one, unit));
  const edit = <A,>(set: (v: A) => void) => (v: A) => {
    edited.current = true;
    set(v);
  };
  const pickUnit = (u: LenUnit) => {
    // an edited field is read first; a half-typed or empty one keeps the length it had (lengthEntry.unitPickStep)
    const s = unitPickStep({ edited: edited.current, typed: edited.current ? typedIn() : null, canon: canon.current, restTouched: restTouched.current, unit: u });
    canon.current = s.canon;
    restTouched.current = s.restTouched;
    edited.current = s.edited;
    setUnit(u);
    setBad(s.bad); // a wrong number typed: the length it had comes back, and it says so
    const f = s.fields;
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
    // the body scrolls, the buttons stay under it in view (the input window gives it its room — InputWindow `scroll={false}`)
    <View testID="quick-length" style={{ gap: space[3], flexShrink: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: space[3] }} showsVerticalScrollIndicator={false}>
      <T v="heading" w="semibold">{t(k("quickTitle"))}</T>
      {unit === "ftin" ? (
        <>
          <RowView style={{ gap: space[2], flexWrap: "wrap", alignItems: "center" }}>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-ft">
              <TextField type="integer" value={ft} onChangeText={(v) => { edit(setFt)(v); if (feetResetsRest({ firstOpen: start === undefined, restTouched: restTouched.current })) { setInc("0"); setE16(0); } }} label={t(k("ft"))} onSubmit={goNext} onFocus={() => setStage("ft")} chain autoFocus selectOnFocus />
            </View>
            <T v="body" tone="mut">{t(k("ft"))}</T>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-in">
              <TextField type="number" value={inc} onChangeText={(v) => { restTouched.current = true; edit(setInc)(v); const big = inchesTooBig(v); setBad(big); setStage(inchesComplete(v) && !big ? "frac" : "in"); }} label={t(k("in"))} onSubmit={stage === "frac" ? apply : goNext} onFocus={() => setStage((s0) => (s0 === "frac" ? s0 : "in"))} focusNow={inFocus} chain selectOnFocus />
            </View>
            <FracText value={e16} testID="quick-length-frac" />
            <UnitPick unit={unit} onUnit={pickUnit} testID="quick-length-unit" />
          </RowView>
          <FracPicker value={e16} onChange={(v) => { edited.current = true; restTouched.current = true; setE16(v); setBad(false); }} active={stage === "frac"} testID="quick-length-fracs" />
          <Pull ft={ft} inc={inc} e16={e16} onPull={(x) => { edited.current = true; restTouched.current = true; setFt(String(x.ft)); setInc(String(x.inch)); setE16(x.sixteenths); setBad(false); }} testID="quick-length-tape" />
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
      </ScrollView>
      <RowView style={{ gap: space[2], justifyContent: "flex-end" }}>
        {unit === "ftin" && stage !== "frac" ? <View testID="quick-length-next"><Button label={t(k("next"))} size="sm" variant="secondary" onPress={goNext} /></View> : null}
        <View testID="quick-length-cancel"><Button label={t(k("quickCancel"))} size="sm" variant="ghost" onPress={onCancel} /></View>
        <View testID="quick-length-apply"><Button label={t(k("apply"))} size="sm" onPress={apply} /></View>
      </RowView>
    </View>
  );
}

/**
 * One value of the window (DS §9б, #2412 круг 4.3): the label over the field (one window — one kind of field), «⌄» opens
 * the menu at the field, «›» the list — the parts of the supplier's chart, whose long names are told apart by sight
 * (`list`). «Ничего» and the like — `top`, their own group first. An element's own value the company no longer offers
 * stays, marked by a word (not by colour, rule 2).
 */
function Choice<K extends string>({ label, testID, items, value, onChange, offered, list }: { label: string; testID: string; items: PickerItem<K>[]; value: K | undefined; onChange: (v: K) => void; offered?: readonly string[]; list?: boolean }) {
  const { t } = useI18n();
  const off = (it: PickerItem<K>) => (offered && !it.top && !offered.includes(it.key) ? { ...it, label: `${it.label} · ${t(k("notOffered"))}` } : it);
  return <SelectField labelAbove list={list} label={label} testID={testID} items={items.map(off)} value={value} onChange={onChange} />;
}

/** 2–3 fields side by side (Размер · Этаж, Вид · Размер): each takes its share of the row */
function FieldRow({ children }: { children: React.ReactNode }) {
  const kids = Children.toArray(children).filter(Boolean);
  return (
    <RowView style={{ gap: space[2], alignItems: "flex-start" }}>
      {kids.map((ch, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{ch}</View>)}
    </RowView>
  );
}

/**
 * The colour (founder 09.11): one choice — «Без покраски» is one of them (no separate painted / bare buttons: a colour
 * picked is painted). A downspout also has «Как у gutter» — its gutter's colour, the default, and it follows the gutter.
 * Copper and zinc are bare only. «Как у gutter» and «Без покраски» — their own group first (DS §9б.6).
 */
function ColorPick<A extends { material: string; finish?: "mill" | "painted"; color?: string }>({ a, set, ch, run }: { a: A; set: (p: Partial<A>) => void; ch: Choices; run?: { finish?: "mill" | "painted"; color?: string; material: string } }) {
  const { t } = useI18n();
  const colorLabel = useColorLabel();
  if (MILL_ONLY.has(a.material)) return null;
  // one colour field for a gutter and a downspout (DS §9б.6, founder 23.11 05:25 «цвет — тот же селектор, что у gutter»)
  const { value, colors } = colorChoices(a, ch.palette, { asRun: (c) => t(k("colorAsRun"), { c }), mill: t(k("f.mill")), notOffered: t(k("notOffered")), color: colorLabel }, run);
  return (
    <ColorField labelAbove label={t(k("color"))} testID="attr-color" colors={colors} value={value} onChange={(v) => {
      if (v === "@run" && run) set(((run.finish ?? (run.color ? "painted" : "mill")) === "mill" ? { finish: "mill" } : { finish: "painted", color: run.color }) as Partial<A>);
      else if (v === "@mill") set({ finish: "mill" } as Partial<A>);
      else set({ finish: "painted", color: v } as Partial<A>);
    }} />
  );
}

/** material → gauge, shared by runs and downspouts (the colour is its own field) */
function Stock<A extends { material: string; gauge?: string }>({ a, set, ch }: { a: A; set: (p: Partial<A>) => void; ch: Choices }) {
  const { t } = useI18n();
  const materials = withCurrent(ch.offer.materials, a.material);
  const gauges = withCurrent(ch.offer.gauges[a.material] ?? [], a.gauge);
  return (
    <>
      <Choice label={t(k("material"))} testID="attr-material" offered={ch.offer.materials} items={materials.map((m) => ({ key: m, label: t(k(`m.${m}`)) }))} value={a.material} onChange={(material) => set({ material } as Partial<A>)} />
      {gauges.length ? <Choice label={t(k("gauge"))} testID="attr-gauge" offered={ch.offer.gauges[a.material]} items={gauges.map((g) => ({ key: g, label: g }))} value={a.gauge ?? gauges[0]!} onChange={(gauge) => set({ gauge } as Partial<A>)} /> : null}
    </>
  );
}

/** a corner of the picked run and how it is made (M7c): stored on the run, else the company's default */
export interface RunCorner { found: FoundCorner; method: CornerChoice["method"]; own: boolean; /** the company's method */ def: CornerChoice["method"] }

function Corners({ corners, onCorner }: { corners: RunCorner[]; onCorner: (f: FoundCorner, m: CornerChoice["method"] | null) => void }) {
  const { t } = useI18n();
  if (!corners.length) return null;
  return (
    <View style={{ gap: space[4] }} testID="attr-corners">
      {corners.map((c, i) => (
        // «Как у компании» — the company's method, followed when it changes; a method picked here stays (review M7c №5)
        <Choice
          key={c.found.id}
          testID={`attr-corner-${i}`}
          label={t(k("cornerN"), { n: i + 1, kind: t(k(`ck.${c.found.kind}`)) })}
          items={[{ key: "default" as const, label: t(k("cmDefault"), { m: t(k(`cm.${c.def}`)) }), top: true }, ...(["cut", "strip", "prefab"] as const).map((m) => ({ key: m, label: t(k(`cm.${m}`)) }))]}
          value={c.own ? c.method : "default"}
          onChange={(m) => onCorner(c.found, m === "default" ? null : m)}
        />
      ))}
    </View>
  );
}

/**
 * «Ещё» (П20.9, DS `Collapsible`): what is changed seldom; open by itself when `open0` (a rare field is set), shut again
 * for the next element. The wrapper says which it is — `attr-more` shut, `attr-more-open` open (the e2e read it).
 */
function More({ open0, id, label, children }: { open0: boolean; id: string; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(open0);
  useEffect(() => setOpen(open0), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID={open ? "attr-more-open" : "attr-more"}>
      <Collapsible title={label} open={open} onToggle={setOpen} testID="attr-more-toggle">
        <View style={{ gap: space[4] }}>{children}</View>
      </Collapsible>
    </View>
  );
}

/**
 * The gutter's window (#2412 круг 4.3): the length; Размер · Этаж in one row, the colour on its own line (its whole name, design-review G1 PR2); the profile; «Ещё» — the hanger
 * (a list: the parts of the chart), material, gauge, the roof edge, the corners. The same on 390 (the sheet) and in the
 * side column.
 */
export function RunAttrsView({
  run, onAttrs, onLength, ch = MODULE_CHOICES, corners = [], onCorner, forNew,
}: { run: DrawnRun; onAttrs: (p: Partial<RunAttrs>) => void; onLength: (lengthIn: number | null) => void; ch?: Choices; corners?: RunCorner[]; onCorner?: (f: FoundCorner, m: CornerChoice["method"] | null) => void; /** «Новые желоба» of this drawing (#1563 PR B): no length, story, corners — the same rows otherwise */ forNew?: boolean; }) {
  const { t } = useI18n();
  const a = run.attrs;
  const profiles = withCurrent(ch.offer.profiles, a.profile);
  const sizes = withCurrent(ch.offer.sizes[a.profile] ?? [], a.size);
  const kits = withCurrent(hangerKitsFor(a.profile, ch), a.hanger);
  return (
    <>
      {/* «Для новых желобов»: its title, «Сбросить» and the line under it are the owner's (DrawScreen), above these rows */}
      {forNew ? null : <T v="heading" w="semibold">{`${t(k("run"))} · ${fmtLen(run.lengthIn ?? drawnLengthIn(run), ch.lenFormat)}`}</T>}
      {forNew ? null : <Tape run={run} onLength={onLength} />}
      <FieldRow>
        <Choice label={t(k("size"))} testID="attr-size" offered={ch.offer.sizes[a.profile]} items={sizes.map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
        {forNew ? null : <Choice label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />}
      </FieldRow>
      {/* the colour on a line of its own: in a row of three its name was cut to «Бе…» (design-review G1 PR2 №1, rule 2 — a sample always
          beside its whole name) */}
      {MILL_ONLY.has(a.material) ? null : <ColorPick a={a} set={onAttrs} ch={ch} />}
      <Choice label={t(k("profile"))} testID="attr-profile" offered={ch.offer.profiles} items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
      <More open0={false} id={run.id} label={t(k("moreRun"))}>
        {/* G2 (#2412): the hangers of the chart by name (NAMES-41) need the model's new kits — the list shows the kits there are */}
        <Choice list label={t(k("hanger"))} testID="attr-hanger" offered={hangerKitsFor(a.profile, ch)} items={kits.map((id) => ({ key: id, label: t(k(`k.${id}`)), leading: { icon: "channel" as const } }))} value={a.hanger} onChange={(hanger) => onAttrs({ hanger })} />
        <Stock a={a} set={onAttrs} ch={ch} />
        <Choice label={t(k("mount"))} testID="attr-mount" items={MOUNTS.map((m) => ({ key: m, label: t(k(`mt.${m}`)) }))} value={a.mount ?? "fascia"} onChange={(mount) => onAttrs({ mount })} />
        {onCorner && !forNew ? <Corners corners={corners} onCorner={onCorner} /> : null}
      </More>
    </>
  );
}

/** elbows (founder 08.11): a count for every style of the shape — «A 2 шт, B 1 шт»; the BOUGHT ones (G2, leader №24): a plain one bent
 *  on site shows 0, its bends are the estimate's (G1 next PR: «Elbow A · 75° ⌄ · − n +») */
function Elbows({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const counts = boughtElbowCounts(ds);
  return (
    <Field label={t(k("elbows"))} testID="attr-elbow-qty">
      {Object.entries(counts).map(([style, qty]) => (
        <View key={style} testID={`attr-elbow-${style}`}>
          <Stepper label={elbow(style)} value={qty} min={0} max={12} onChange={(n) => onAttrs(boughtElbowPatch(ds, style, n))} />
        </View>
      ))}
    </Field>
  );
}

/**
 * The kind of the downspout (#929): one menu of four — shape and style; one pick sets both, the size follows the shape
 * (changeDs). A kind whose style the company does not install shows only when it is the one in hand.
 */
function DsKindPick({ ds, onAttrs, ch }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch: Choices }) {
  const { t } = useI18n();
  const cur = dsKindOf(ds.shape, ds.dsStyle);
  const shown = DS_KINDS.filter((x) => x.key === cur.key || ch.offer.dsStyles.includes(x.style));
  return (
    <Choice
      label={t(k("dsKind"))}
      testID="attr-ds-kind"
      items={shown.map((x) => ({ key: x.key, label: t(k(`kind.${x.key}`)).replace("\n", " ") }))}
      value={cur.key}
      onChange={(key) => { const x = DS_KINDS.find((d) => d.key === key)!; onAttrs({ shape: x.shape, dsStyle: x.style }); }}
    />
  );
}

/**
 * The downspout's window (#2412 круг 4.3): Вид · Размер in one row; elbows, offsets; Низ (a menu, «Ничего» first) and
 * Верх (a list); «Ещё» — the colour, material, wall and its hook, its own length, the rare parts. G2 (#2412): its own
 * storey, Elbow / Offset A·B with an angle, the heads of the chart, the hooks by shape.
 */
export function DsAttrsView({ ds, onAttrs, ch = MODULE_CHOICES, run, forNew }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch?: Choices; /** its gutter: «Как у gutter» */ run?: DrawnRun["attrs"]; /** «Новые водостоки» of this drawing (#1563 PR B): the same rows, its own title */ forNew?: boolean }) {
  const { t } = useI18n();
  const w = wallOf(ds.shape, ds.wall);
  const sizes = withCurrent(ch.offer.dsSizes[ds.shape], ds.size);
  const bottoms = withCurrent(ch.offer.bottoms, ds.bottom.kind);
  const wallKits = withCurrent(wallKitsFor(ds.shape, w.wall, ch), w.kit);
  const head = ds.head ?? (ds.funnel ? "funnel" : "none");
  return (
    <>
      {forNew ? null : <T v="heading" w="semibold">{t(k("ds"))}</T>}
      <FieldRow>
        <DsKindPick ds={ds} onAttrs={onAttrs} ch={ch} />
        <Choice label={t(k("size"))} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} items={sizes.map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
      </FieldRow>
      <Elbows ds={ds} onAttrs={onAttrs} />
      <Offsets ds={ds} onAttrs={onAttrs} />
      <Choice label={t(k("bottom"))} testID="attr-bottom" offered={ch.offer.bottoms} items={bottoms.map((b) => ({ key: b, label: t(k(`b.${b}`)), top: b === "none" }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Choice list label={t(k("head"))} testID="attr-head" items={DS_HEADS.map((h) => ({ key: h, label: t(k(`h.${h}`)), top: h === "none", ...(h === "none" ? {} : { leading: { icon: "downspout" as const } }) }))} value={head} onChange={(h) => onAttrs({ head: h === "none" ? undefined : h, funnel: undefined })} />
      <More open0={dsMoreSet(ds, run)} id={ds.id} label={t(k("moreDs"))}>
        {MILL_ONLY.has(ds.material) ? null : <ColorPick a={ds} set={onAttrs} ch={ch} run={run} />}
        <Stock a={ds} set={onAttrs} ch={ch} />
        <Choice label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
        <Choice list label={t(k("wallKit"))} testID="attr-wall-kit" offered={wallKitsFor(ds.shape, w.wall, ch)} items={wallKits.map((id) => ({ key: id, label: t(k(`wk.${id}`)), leading: { icon: "downspout" as const } }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
        <DsLength ds={ds} onAttrs={onAttrs} />
        <DsRare key={ds.id} ds={ds} onAttrs={onAttrs} />
      </More>
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
    <Choice
      label={t(k("dsLength"))}
      testID="attr-ds-length"
      items={[{ key: "0", label: t(k("heightAuto")), top: true }, ...fts.map((n) => ({ key: String(n), label: `${n}′` }))]}
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
  // unset — the engine's default (a round one 1 × 2″, «Расход v2»): the window shows what the estimate counts
  const off = ds.offsets ? ds.offsets[0] : defaultOffsetsFor({ shape: ds.shape })[0];
  const len = off?.lengthIn ?? OFFSETS_IN[0];
  const std = (OFFSETS_IN as readonly number[]).includes(len);
  const [own, setOwn] = useState(std ? "" : String(len));
  const [ownOpen, setOwnOpen] = useState(!std);
  const put = (lengthIn: number) => onAttrs({ offsets: [{ lengthIn, qty: off?.qty ?? 1 }] });
  const putOwn = () => { const n = Number(own); if (n > 0 && n <= 24) put(Math.round(n * DENOM) / DENOM); };
  return (
    <Field label={t(k("offsets"))} testID="attr-offsets">
      {/* the count makes offsets; the length is picked only once there are some (review M7c №6) */}
      <View testID="attr-offset-qty">
        <Stepper label={t(k("offsetQty"))} value={off?.qty ?? 0} min={0} max={8} onChange={(qty) => onAttrs({ offsets: qty ? [{ lengthIn: len, qty }] : undefined })} />
      </View>
      {off?.qty ? (
        <View style={{ gap: space[2] }}>
          <Choice
            label={t(k("offsetLen"))}
            testID="attr-offset-len"
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
                <TextField type="number" value={own} onChangeText={setOwn} label={t(k("offsetOwn"))} onSubmit={putOwn} />
              </View>
              <T v="body" tone="mut">{t(k("in"))}</T>
              <View testID="attr-offset-own-apply"><Button label={t(k("apply"))} size="sm" variant="secondary" onPress={putOwn} /></View>
            </RowView>
          ) : null}
        </View>
      ) : null}
    </Field>
  );
}

/**
 * The rare parts of a downspout behind «Ещё» (M7c): what is not on the supplier's chart is shown only while an old
 * drawing has it set (NAMES-41: no Reducer, no outlet screen on the chart) — the data stays, the window does not offer
 * it (`attrShown.ts`: the diverter — a square corrugated downspout, the outlet screen — a round one). A row the window
 * opened with stays until it closes. «Ещё» opens by itself when something under it is set (`dsMoreSet`).
 */

function DsRare({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const to = ds.reducers?.[0]?.to ?? "";
  // a reducer set before the size changed stays named (review G1)
  const smaller = withCurrent(smallerSizes(ds.shape, ds.size), to || undefined);
  const [at] = useState(ds); // the downspout as the window opened (DsRare is keyed by its id)
  const shown = dsRareShown(ds, at);
  return (
    <>
      {shown.reducer ? <Choice label={t(k("reducer"))} testID="attr-reducer" items={[{ key: "", label: t(k("reducerNone")), top: true }, ...smaller.map((s) => ({ key: s, label: dsSize(s) }))]} value={to} onChange={(to) => onAttrs({ reducers: to ? [{ to, qty: 1 }] : undefined })} /> : null}
      {shown.diverter ? <ToggleRow testID="attr-diverter" value={!!ds.diverter} onChange={(v) => onAttrs({ diverter: v || undefined })} label={t(k("diverter"))} /> : null}
      {shown.outletScreen ? <ToggleRow testID="attr-outlet-screen" value={!!ds.outletScreen} onChange={(v) => onAttrs({ outletScreen: v || undefined })} label={t(k("outletScreen"))} /> : null}
    </>
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

/**
 * «Закрыть | Сохранить» at the bottom of a gutter's / downspout's window (DS §7.3, Б1 table; founder 16.11, #1857; mock v43): one row,
 * half the width each, 44 visible (`Button size="bar"`, as the action bar); no ✕ on top. In the sheet (390) «Закрыть» goes the sheet's own
 * way out — with unsaved edits it asks «Сохранить изменения?» first (`useSheetClose`); in the side column (820/1280) — `onClose`.
 */
export function WinButtons({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { t } = useI18n();
  const sheetClose = useSheetClose();
  return (
    <View style={{ flexDirection: "row", gap: space[2] }} testID="attr-win-buttons">
      <View style={{ flex: 1, minWidth: 0 }} testID="attr-win-close">
        <Button label={t(k("close"))} variant="secondary" size="bar" full onPress={sheetClose ?? onClose} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }} testID="attr-win-save">
        <Button label={t(k("save"))} size="bar" full onPress={onSave} />
      </View>
    </View>
  );
}
