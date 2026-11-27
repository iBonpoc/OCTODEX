/**
 * The attribute panel of the canvas (docs/specs/33-gutters-screens.md П21.8 M5c): what the picked run or downspout
 * is made of. One component: on 390 it sits in the core's Sheet, on 820/1280 it is the column on the right of the
 * canvas. Every choice is one edit of the drawing at once (the canvas's «Назад» takes it back, saved 1 s later) —
 * no «Save» button, like the storey. The tape: feet + inches, «Применить» → confidence `taped` (icon + word, rule 2).
 * A colour is its name with its sample in the one colour field (DS §9б.6, rule 2 3rd exception). The lists are what the company installs and its palette (settings, M7b);
 * an element's own value the company no longer offers stays as one more chip «нет в списке» (spec 33 П22.2 №7).
 */
import { sizeText } from "../sizeText";
import { Children, useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, useWindowDimensions, View } from "react-native";
import { measureAfterKeyboard } from "./afterKeyboard";
import { component, size as sizes, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Button, Segmented, StatusChip, Stepper, TextField } from "@/ui/controls";
import { Collapsible } from "@/ui/collapsible";
import type { PickerItem } from "@/ui/pickerSheet";
import { SelectField } from "@/ui/selectField";
import { ColorField } from "@/ui/colorField";
import { ToggleRow } from "@/ui/toggleRow";
import { OptionTiles } from "@/ui/optionTile";
import { Icon, Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { Menu, useSheetClose } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import { COLORS, ELBOW_STYLES, PROFILE_ICON, SIZES_BY_PROFILE, DS_SIZES, DS_HEADS, DS_KINDS, dsKindOf, DS_SHAPES, smallerSizes, boughtElbowCounts, dsStoryPatch, dsStoryShown, OFFSETS_IN, hangerKitsFor, MILL_ONLY, MOUNTS, MAX_RUN_IN, oneIn, tapeIn, unitFields, wallKitsFor, wallOf, WALLS, withCurrent, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { MODULE_CHOICES, type Choices } from "../settings";
import { colorChoices } from "./colorChoices";
import { dsMoreSet, dsRareShown } from "./attrShown";
import { dsOwnFt } from "./dsOwnFt";
import { readOwnDsSize, readOwnRunSize } from "../canvas/ownSize";
import { FracPicker } from "./FracPicker";
import { FRAC_SLOT } from "./fracSlot";
import { feetResetsRest, inchesComplete, inchesTooBig, mmDraft, nextStage, tapeDraft, unitPickStep, type EntryStage } from "./lengthEntry";
import { MM_SCALE, SIXTEENTHS_SCALE, SIXTEENTHS_SCALE_IN, Tape as TapeStrip } from "./Tape";
import { DENOM, fmtLen, fracLabel, LEN_UNITS, MM_OF, MM_PER_IN, type LenFormat, type LenUnit } from "../canvas/format";
import { storyOf } from "../canvas/scene";
import { dsLengthLine } from "../canvas/dsLength";
import type { GutterRulesOverride } from "@octo/estimating-engine";
import { ELBOW_ANGLES, offsetRest, offsetRow, offsetsPatch, offsetStylesOf, rectElbowAngle, rectElbowPatch, roundElbow, roundElbowPatch, roundElbowRest, type OffsetStyle } from "../canvas/fittingRows";
import { drawnLengthIn, type CornerChoice, type DrawnDownspout, type DrawnRun, type FoundCorner } from "../geometry";

const k = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
const dsSize = sizeText; // one format everywhere (#1916)
/** «3,810 mm · 12′ 6″»: the company's format, and feet and inches beside it when the format is another */
const lineLenText = (inches: number, fmt: LenFormat) => (fmt === "ftin" ? fmtLen(inches, "ftin") : `${fmtLen(inches, fmt)} · ${fmtLen(inches, "ftin")}`);
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

/** the tape: feet and inches; every change goes in at once (v43: no «Применить» — the window's «Сохранить» keeps it), «По рисунку» puts the drawn one back */
function Tape({ run, onLength, fmt = "ftin" }: { run: DrawnRun; onLength: (lengthIn: number | null) => void; /** the company's format of lengths: the unit the window starts in */ fmt?: LenFormat }) {
  const { t } = useI18n();
  const cur = run.lengthIn ?? drawnLengthIn(run);
  // the fields show the length as it is, to the sixteenth: feet, inches and sixteenths
  const f0 = unitFields(cur, "ftin");
  const [ft, setFt] = useState(f0.ft);
  const [inc, setInc] = useState(f0.inc);
  const [e16, setE16] = useState(f0.e16);
  const [bad, setBad] = useState(false);
  // «футы | мм» (v43): feet · inches · fraction, or one number in millimetres (the tape strip is inches only)
  const [unit, setUnit] = useState<"ftin" | "mm">(fmt === "mm" || fmt === "cm" || fmt === "m" ? "mm" : "ftin");
  const [mm, setMm] = useState(unitFields(cur, "mm").one);
  const own = useRef<number | null>(null); // the length this tape just wrote: the fields already show it (retyping must not rewrite them)
  // another run picked, «Назад», or a dragged end: the fields show the length it has now
  const lastRun = useRef(run.id);
  useEffect(() => {
    if (lastRun.current !== run.id) { lastRun.current = run.id; own.current = null; } // another gutter: its fields, even at the same length
    if (own.current === cur) return;
    own.current = null;
    const x = unitFields(cur, "ftin");
    setFt(x.ft);
    setInc(x.inc);
    setE16(x.e16);
    setMm(unitFields(cur, "mm").one);
    setBad(false);
  }, [run.id, cur]);
  const pickUnit = (u: "ftin" | "mm") => {
    // the fields are rewritten from the length the run has (a half-typed or wrong one is dropped, its warning with it)
    const x = unitFields(cur, "ftin");
    setFt(x.ft); setInc(x.inc); setE16(x.e16); setMm(unitFields(cur, "mm").one); setBad(false);
    setUnit(u);
  };
  const putMm = (text: string) => {
    setMm(text);
    const d = mmDraft(text, cur);
    setBad(d.bad);
    if (d.len !== null && !d.same) { own.current = d.len; onLength(d.len); }
  };
  const put = (nft: string, ninc: string, ne16: number) => {
    setFt(nft);
    setInc(ninc);
    setE16(ne16);
    const d = tapeDraft(nft, ninc, ne16, cur);
    setBad(d.bad);
    if (d.len !== null && !d.same) {
      own.current = d.len;
      onLength(d.len);
    }
  };
  const taped = run.lengthIn !== undefined;
  return (
    <Field label={t(k("length"))} testID="attr-length">
      <Segmented full equal radio label={t(k("unitTitle"))} testID="attr-length-unit" items={[{ key: "ftin", label: t(k("unit.ftin")) }, { key: "mm", label: t(k("unit.mm")) }]} value={unit} onChange={pickUnit} />
      {unit === "mm" ? (
        <>
          <View testID="attr-length-mm"><TextField type="number" value={mm} onChangeText={putMm} suffix={t(k("unit.mm"))} label={t(k("lengthMm"))} /></View>
          <T v="caption" tone="mut">{t(k("tapeInchesOnly"))}</T>
        </>
      ) : (
      <>
      <RowView style={{ gap: space[2], flexWrap: "wrap", alignItems: "center" }}>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-ft">
          <TextField type="integer" value={ft} onChangeText={(v) => put(v, inc, e16)} label={t(k("ft"))} />
        </View>
        <T v="body" tone="mut">{t(k("ft"))}</T>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-in">
          <TextField type="number" value={inc} onChangeText={(v) => put(ft, v, e16)} label={t(k("in"))} />
        </View>
        <FracText value={e16} testID="attr-length-frac" />
        <T v="body" tone="mut">{t(k("in"))}</T>
      </RowView>
      <Pull ft={ft} inc={inc} e16={e16} onPull={(x) => put(String(x.ft), String(x.inch), x.sixteenths)} testID="attr-length-tape" />
      </>
      )}
      {taped ? <View testID="attr-length-reset"><Button label={t(k("reset"))} size="sm" variant="ghost" onPress={() => onLength(null)} /></View> : null}
      {bad ? <View testID="attr-length-bad"><StatusChip status="warn" label={t(k(unit === "mm" ? "badLengthMm" : "badLength"))} soft /></View> : null}
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
  // by the title (#3071) it names the whole unit — «фут + дюйм ⌄» is the unit's choice, never read as the inches' label (#3078, design review №12)
  const word = unit === "in" ? t(k("in")) : t(k(`unit.${unit}`));
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
      {/* the unit choice stands by the title (design-review #3066 №2): the fields' row keeps room for «Далее», nothing jumps */}
      <RowView style={{ gap: space[2], alignItems: "center", justifyContent: "space-between" }}>
        <T v="heading" w="semibold" style={{ flexShrink: 1 }}>{t(k("quickTitle"))}</T>
        {unit === "ftin" ? <UnitPick unit={unit} onUnit={pickUnit} testID="quick-length-unit" /> : null}
      </RowView>
      {unit === "ftin" ? (
        <>
          <RowView style={{ gap: space[1], alignItems: "center" }}>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-ft">
              <TextField type="integer" value={ft} onChangeText={(v) => { edit(setFt)(v); if (feetResetsRest({ firstOpen: start === undefined, restTouched: restTouched.current })) { setInc("0"); setE16(0); } }} label={t(k("ft"))} onSubmit={goNext} onFocus={() => setStage("ft")} chain autoFocus selectOnFocus />
            </View>
            <T v="body" tone="mut">{t(k("ft"))}</T>
            <View style={{ width: component.qtyFieldW }} testID="quick-length-in">
              <TextField type="number" value={inc} onChangeText={(v) => { restTouched.current = true; edit(setInc)(v); const big = inchesTooBig(v); setBad(big); setStage(inchesComplete(v) && !big ? "frac" : "in"); }} label={t(k("in"))} onSubmit={stage === "frac" ? apply : goNext} onFocus={() => setStage((s0) => (s0 === "frac" ? s0 : "in"))} focusNow={inFocus} chain selectOnFocus />
            </View>
            <FracText value={e16} testID="quick-length-frac" />
            {/* «Далее» — a step of the typing, with the fields (the phone's number pad has no «next» key, #1316); the window's own row below holds
                two buttons only, «Отменить · Применить» (DS Б1а; founder 27.11, #3064 «никаких столбиков кнопок»). At the fraction it is not needed:
                its place stays (disabled, no testID), so the rows under it never jump (design-review #3066 №2) */}
            {stage !== "frac"
              ? <View testID="quick-length-next" style={{ marginLeft: "auto" }}><Button label={t(k("next"))} variant="secondary" onPress={goNext} /></View>
              : <View style={{ marginLeft: "auto" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Button label={t(k("next"))} variant="secondary" disabled onPress={goNext} /></View>}
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
      {bad ? <View testID="quick-length-bad"><StatusChip status="warn" label={t(k(unit === "mm" ? "badLengthMm" : "badLength"))} soft /></View> : null}
      </ScrollView>
      <RowView style={{ gap: space[2], justifyContent: "space-between" }}>
        <View testID="quick-length-cancel"><Button label={t(k("quickCancel"))} variant="ghost" onPress={onCancel} /></View>
        <View testID="quick-length-apply"><Button label={t(k("apply"))} onPress={apply} /></View>
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
 * A value picked by sight (founder 27.11, #2980 / #2986: «должен быть не селектор, это должны быть иконки»): the label over a
 * row of tiles, an icon over the name each (DS §9 А2б, the places of the list). The tiles are `<testID>-<key>`.
 */
function Tiles<K extends string>({ label, testID, items, value, onChange }: { label: string; testID: string; items: { key: K; label: string; icon: React.ComponentProps<typeof OptionTiles>["items"][number]["icon"] }[]; value: K; onChange: (v: K) => void }) {
  return (
    <View style={{ gap: space[1] }}>
      <T v="caption" tone="mut" numberOfLines={1}>{label}</T>
      <OptionTiles label={label} testID={testID} items={items} value={value} onChange={onChange} />
    </View>
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
    <FieldRow>
      <Choice label={t(k("material"))} testID="attr-material" offered={ch.offer.materials} items={materials.map((m) => ({ key: m, label: t(k(`m.${m}`)) }))} value={a.material} onChange={(material) => set({ material } as Partial<A>)} />
      {gauges.length ? <Choice label={t(k("gauge"))} testID="attr-gauge" offered={ch.offer.gauges[a.material]} items={gauges.map((g) => ({ key: g, label: g }))} value={a.gauge ?? gauges[0]!} onChange={(gauge) => set({ gauge } as Partial<A>)} /> : null}
    </FieldRow>
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
  run, onAttrs, onLength, ch = MODULE_CHOICES, corners = [], onCorner, forNew, no,
}: { /** its number among the drawing's gutters: «Gutter № 2» */ no?: number; run: DrawnRun; onAttrs: (p: Partial<RunAttrs>) => void; onLength: (lengthIn: number | null) => void; ch?: Choices; corners?: RunCorner[]; onCorner?: (f: FoundCorner, m: CornerChoice["method"] | null) => void; /** «Новые желоба» of this drawing (#1563 PR B): no length, story, corners — the same rows otherwise */ forNew?: boolean; }) {
  const { t } = useI18n();
  const a = run.attrs;
  const profiles = withCurrent(ch.offer.profiles, a.profile);
  const sizes = withCurrent(ch.offer.sizes[a.profile] ?? [], a.size);
  const kits = withCurrent(hangerKitsFor(a.profile, ch), a.hanger);
  return (
    <>
      {/* «Для новых желобов»: its title, «Сбросить» and the line under it are the owner's (DrawScreen), above these rows */}
      {forNew ? null : <View testID="attr-title"><T v="heading" w="semibold">{no ? t(k("runNo"), { n: no }) : t(k("run"))}</T></View>}
      {/* the length of the line in the company's format (and in feet when it is another): the window's title no longer carries it (v43: «линия · 3,810 мм · 12′ 6″») */}
      {forNew ? null : <View testID="attr-line-len"><T v="caption" tone="mut">{t(k("lineLen"), { len: lineLenText(run.lengthIn ?? drawnLengthIn(run), ch.lenFormat) })}</T></View>}
      {forNew ? null : <Tape run={run} onLength={onLength} fmt={ch.lenFormat} />}
      <FieldRow>
        <SizePick key={`${run.id}.${a.profile}`} testID="attr-size" offered={ch.offer.sizes[a.profile]} sizes={sizes} known={SIZES_BY_PROFILE[a.profile]} label={inch} value={a.size} read={readOwnRunSize} hint="9″" onSize={(size) => onAttrs({ size })} />
        {/* «Для новых»: no storey — the colour takes its place, two short fields in one row (founder 27.11, #3015) */}
        {forNew ? (MILL_ONLY.has(a.material) ? null : <ColorPick a={a} set={onAttrs} ch={ch} />) : <Choice label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />}
      </FieldRow>
      {/* the colour on a line of its own: in a row of three its name was cut to «Бе…» (design-review G1 PR2 №1, rule 2 — a sample always
          beside its whole name) */}
      {forNew || MILL_ONLY.has(a.material) ? null : <ColorPick a={a} set={onAttrs} ch={ch} />}
      {/* the profile by its cross-section (#2986): tiles, the names of the supplier's chart */}
      <Tiles label={t(k("profile"))} testID="attr-profile" items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)), icon: PROFILE_ICON[p] }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
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

/**
 * One fitting row (v43 PR C): «Elbow A · 75° ⌄ · − n +» — the field (its label is the part, its value the angle or the length) and
 * the count. At 0 the value picked waits in the row (nothing to write it on) and goes in with the first «+».
 */
function CountRow({ label, testID, valueTestID, items, value, onValue, qty, onQty, max }: { label: string; testID: string; valueTestID: string; items: PickerItem<string>[]; value: string; onValue: (v: string) => void; qty: number; onQty: (n: number) => void; max: number }) {
  return (
    <RowView style={{ gap: space[2], alignItems: "center" }}>
      <View style={{ width: component.countRowLabelW }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><T v="body" w="semibold" numberOfLines={2}>{label}</T></View>
      <View style={{ flex: 1 }}><SelectField bare label={label} testID={valueTestID} items={items} value={value} onChange={onValue} /></View>
      <View testID={testID}><Stepper hideLabel compact label={label} value={qty} min={0} max={max} onChange={onQty} /></View>
    </RowView>
  );
}

/** the angles of a row: the menu's, and the one the drawing has when it is another */
const angleItems = (cur: string): PickerItem<string>[] => withCurrent(ELBOW_ANGLES.map(String), cur).map((a) => ({ key: a, label: elbow(a) }));

/** a rect elbow A / B: the count and the angle */
function RectElbow({ ds, style, onAttrs }: { ds: DrawnDownspout; style: string; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const qty = boughtElbowCounts(ds)[style] ?? 0;
  const own = rectElbowAngle(ds, style);
  const [pend, setPend] = useState(own); // the angle picked at 0 waits for the first «+»
  useEffect(() => { if (qty > 0) setPend(own); }, [qty, own]); // what is written is what waits when the count comes back to 0
  const angle = qty > 0 ? own : pend;
  return (
    <CountRow
      label={t(k("elbowRow"), { s: style })} testID={`attr-elbow-${style}`} valueTestID={`attr-elbow-${style}-angle`}
      items={angleItems(String(angle))} value={String(angle)}
      onValue={(v) => (qty > 0 ? onAttrs(rectElbowPatch(ds, style, qty, Number(v))) : setPend(Number(v)))}
      qty={qty} onQty={(n) => onAttrs(rectElbowPatch(ds, style, n, angle))} max={12}
    />
  );
}

/** a round downspout's one elbow row: the angle is its style */
function RoundElbow({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const cur = roundElbow(ds);
  const [pend, setPend] = useState(cur.style);
  useEffect(() => { if (cur.qty > 0) setPend(cur.style); }, [cur.qty, cur.style]);
  const style = cur.qty > 0 ? cur.style : pend;
  const rest = roundElbowRest(ds);
  return (
    <>
      <CountRow
        label={t(k("elbowRowRound"))} testID="attr-elbow-round" valueTestID="attr-elbow-round-angle"
        items={angleItems(style)} value={style}
        onValue={(v) => (cur.qty > 0 ? onAttrs(roundElbowPatch(ds, { style: v })) : setPend(v))}
        qty={cur.qty} onQty={(n) => onAttrs(roundElbowPatch(ds, { style, qty: n }))} max={12}
      />
      {/* an old drawing may carry other angles: the row does not rewrite them, it says them (rule 16) */}
      {rest.length ? <View testID="attr-elbow-rest"><T v="caption" tone="mut">{t(k("fittingRest"), { list: rest.map((e) => `${elbow(e.style)} × ${e.qty}`).join(", ") })}</T></View> : null}
    </>
  );
}

/** elbows (founder 08.11, v43): a row for every style of the shape — rect «Elbow A», «Elbow B» with an angle each, round one row */
function Elbows({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  return (
    <View testID="attr-elbow-qty" style={{ gap: space[2] }}>
      {ds.shape === "round" ? <RoundElbow ds={ds} onAttrs={onAttrs} /> : ELBOW_STYLES.rect.map((style) => <RectElbow key={style} ds={ds} style={style} onAttrs={onAttrs} />)}
    </View>
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
    <Tiles
      label={t(k("dsKind"))}
      testID="attr-ds-kind"
      items={shown.map((x) => ({ key: x.key, label: t(k(`kind.${x.key}`)), icon: x.icon }))}
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
export function DsAttrsView({ ds, onAttrs, ch = MODULE_CHOICES, run, forNew, no, rulesOver }: { /** the company's rules (settings): the length line counts by them, as the estimate does */ rulesOver?: GutterRulesOverride; /** its number among the drawing's downspouts (D{n} on the canvas): «Downspout № 2» */ no?: number; ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch?: Choices; /** its gutter: «Как у gutter» */ run?: DrawnRun["attrs"]; /** «Новые водостоки» of this drawing (#1563 PR B): the same rows, its own title */ forNew?: boolean }) {
  const { t } = useI18n();
  const w = wallOf(ds.shape, ds.wall);
  const sizes = withCurrent(ch.offer.dsSizes[ds.shape], ds.size);
  const bottoms = withCurrent(ch.offer.bottoms, ds.bottom.kind);
  const wallKits = withCurrent(wallKitsFor(ds.shape, w.wall, ch), w.kit);
  const head = ds.head ?? (ds.funnel ? "funnel" : "none");
  const runStory = storyOf(run?.story);
  const ln = dsLengthLine(ds, runStory, rulesOver);
  const lenText = ln.own ? t(k("dsLenOwn"), { ft: ln.ft }) : ln.stories === 0 ? t(k("dsLenRoof")) : t(k("dsLenStory"), { ft: ln.ft });
  return (
    <>
      {forNew ? null : <View testID="attr-title"><T v="heading" w="semibold">{no ? t(k("dsNo"), { n: no }) : t(k("ds"))}</T></View>}
      {/* three fields in one row do not fit 390 (a value is cut to «2…», «1…»): «Вид» has its line, «Размер · Этаж» the next (v43 shows the three in one row;
          the shared field has a padding the mock's has not — the words come first) */}
      <DsKindPick ds={ds} onAttrs={onAttrs} ch={ch} />
      <FieldRow>
        <SizePick key={`${ds.id}.${ds.shape}`} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} sizes={sizes} known={DS_SIZES[ds.shape]} label={dsSize} value={ds.size} read={(v) => readOwnDsSize(ds.shape, v)} hint={ds.shape === "round" ? "5″" : "3x5"} onSize={(size) => onAttrs({ size })} />
        {/* its own storey (G2 #2465): the length of the pipe follows it; written only when it differs from the gutter's (rule 16) */}
        {forNew ? (MILL_ONLY.has(ds.material) ? null : <ColorPick a={ds} set={onAttrs} ch={ch} run={run} />) : <Choice label={t(k("story"))} testID="attr-ds-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t(k("storyWin"), { n }) }))} value={String(dsStoryShown(ds, runStory)) as "1"} onChange={(n) => onAttrs(dsStoryPatch(runStory, Number(n)))} />}
      </FieldRow>
      {forNew ? null : <View testID="attr-ds-length-line"><T v="caption" tone="mut">{lenText}</T></View>}
      <Elbows ds={ds} onAttrs={onAttrs} />
      <Offsets ds={ds} onAttrs={onAttrs} />
      {/* Низ · Верх: two short menus in one row (#3015) */}
      <FieldRow>
      <Choice label={t(k("bottom"))} testID="attr-bottom" offered={ch.offer.bottoms} items={bottoms.map((b) => ({ key: b, label: t(k(`b.${b}`)), top: b === "none" }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Choice label={t(k("head"))} testID="attr-head" items={DS_HEADS.map((h) => ({ key: h, label: t(k(`h.${h}`)), top: h === "none" }))} value={head} onChange={(h) => onAttrs({ head: h === "none" ? undefined : h, funnel: undefined })} />
      </FieldRow>
      <More open0={dsMoreSet(ds, run)} id={ds.id} label={t(k("moreDs"))}>
        {forNew || MILL_ONLY.has(ds.material) ? null : <ColorPick a={ds} set={onAttrs} ch={ch} run={run} />}
        <Stock a={ds} set={onAttrs} ch={ch} />
        <DsLength key={ds.id} ds={ds} onAttrs={onAttrs} />
        <DsRare key={`rare-${ds.id}`} ds={ds} onAttrs={onAttrs} />
        {/* the wall and its bracket last (founder 27.11, #2985: «крепление к стене ниже опустить») */}
        <Choice label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
        <Choice list label={t(k("wallKit"))} testID="attr-wall-kit" offered={wallKitsFor(ds.shape, w.wall, ch)} items={wallKits.map((id) => ({ key: id, label: t(k(`wk.${id}`)), leading: { icon: "downspout" as const } }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
      </More>
    </>
  );
}

/**
 * The size field with «Свой» last (founder 27.11, #2981): a size of its own is typed under the field — whole inches, read at once
 * (a good one goes in, anything else says so and goes in nowhere). Its part is not in the price list: the estimate line says
 * «нет цены» (answer in #2981). A size of its own already set is one of the field's values, the field open on it.
 */
function SizePick({ testID, sizes, known, value, offered, label, read, onSize, hint }: { testID: string; sizes: string[]; /** the module's sizes: any other is one of its own */ known: readonly string[]; value: string; offered?: readonly string[]; label: (s: string) => string; read: (text: string) => string | null; onSize: (s: string) => void; hint: string }) {
  const { t } = useI18n();
  const std = known.includes(value);
  const [ownOpen, setOwnOpen] = useState(!std);
  const [own, setOwn] = useState(std ? "" : value);
  const [bad, setBad] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Choice
        label={t(k("size"))} testID={testID} offered={offered}
        items={[...sizes.filter((x) => std || x !== value).map((x) => ({ key: x, label: label(x) })), { key: "@own", label: t(k("sizeOwn")) }]}
        value={ownOpen ? "@own" : value}
        onChange={(v) => {
          if (v === "@own") return setOwnOpen(true);
          setOwnOpen(false);
          setBad(false);
          onSize(v);
        }}
      />
      {ownOpen ? (
        <View style={{ gap: space[1] }}>
          <View testID={`${testID}-own`} style={{ gap: space[1] }}>
            <T v="caption" tone="mut" numberOfLines={1}>{t(k("sizeOwnLabel"))}</T>
            <TextField type="text" value={own} placeholder={hint} label={t(k("sizeOwnLabel"))} onChangeText={(v) => { setOwn(v); const s = read(v); setBad(s === null); if (s !== null) onSize(s); }} />
          </View>
          {bad && own.trim() !== "" ? <View testID={`${testID}-own-bad`}><StatusChip status="warn" label={t(k("badOwnSize"), { hint })} soft /></View> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The downspout's own height (#1276; founder 27.11, #2985: «что такое длина, я не понимаю. И зачем для этого селектор»): a number
 * of feet, empty — by the storey (the line above says which). It was a menu of 16 lengths named «Длина». Read at once: a good
 * number (1–100 ft) goes in, anything else says so and goes in nowhere; emptied — back to the storey.
 */
function DsLength({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(ds.heightIn ? String(Math.round((ds.heightIn / 12) * 2) / 2) : "");
  const [bad, setBad] = useState(false);
  return (
    <View style={{ gap: space[1] }}>
      <View testID="attr-ds-length" style={{ gap: space[1] }}>
        {/* the label over the field, as every field of the window has it (TextField's own label is the screen reader's) */}
        <T v="caption" tone="mut" numberOfLines={1}>{t(k("dsLength"))}</T>
        <TextField
          type="number" value={text} suffix="ft" placeholder={t(k("heightAuto"))} label={t(k("dsLength"))}
          onChangeText={(v) => {
            setText(v);
            const n = dsOwnFt(v);
            setBad(n === "bad");
            if (n !== "bad") onAttrs({ heightIn: n === null ? undefined : n * 12 });
          }}
        />
      </View>
      {bad ? <View testID="attr-ds-length-bad"><StatusChip status="warn" label={t(k("badDsOwn"))} soft /></View> : null}
    </View>
  );
}

/** an offset row A / B (v43): the count and the length — 1″ · 2″ · 4″ or its own (a custom part; the engine marks lengths it does not stock) */
function OffsetRow({ ds, style, onAttrs }: { ds: DrawnDownspout; style: OffsetStyle; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const row = offsetRow(ds, style);
  const std = (OFFSETS_IN as readonly number[]).includes(row.lengthIn);
  const [pend, setPend] = useState(row.lengthIn); // the length picked at 0 waits for the first «+»
  useEffect(() => { if (row.qty > 0) setPend(row.lengthIn); }, [row.qty, row.lengthIn]);
  const [own, setOwn] = useState(std ? "" : String(row.lengthIn));
  const [ownOpen, setOwnOpen] = useState(!std);
  const [ownBad, setOwnBad] = useState(false);
  const rest = offsetRest(ds, style); // the other lengths of an old drawing: not rewritten (rule 16)
  const len = row.qty > 0 ? row.lengthIn : pend;
  const put = (lengthIn: number) => (row.qty > 0 ? onAttrs(offsetsPatch(ds, style, { lengthIn })) : setPend(lengthIn));
  const sfx = style === "A" ? "" : `-${style}`; // the A row (the only one of a round downspout) keeps the ids it always had
  const label = ds.shape === "round" ? t(k("offsetRowRound")) : t(k("offsetRow"), { s: style });
  return (
    <View style={{ gap: space[2] }}>
      <CountRow
        label={label} testID={`attr-offset${sfx}-qty`} valueTestID={`attr-offset${sfx}-len`}
        items={[...OFFSETS_IN.map((n) => ({ key: String(n), label: inch(String(n)) })), { key: "own", label: t(k("offsetOwn")) }]}
        value={ownOpen ? "own" : String(len)}
        onValue={(v) => {
          if (v === "own") return setOwnOpen(true);
          setOwnOpen(false);
          put(Number(v));
        }}
        qty={row.qty} onQty={(qty) => onAttrs(offsetsPatch(ds, style, { qty, lengthIn: len }))} max={8}
      />
      {ownOpen ? (
        <View style={{ gap: space[1] }}>
          <View testID={`attr-offset${sfx}-own`}>
            {/* read at once, like the gutter's length: a good number (up to 24″, 1/16″) goes in; anything else says so and goes in nowhere */}
            <TextField type="number" value={own} suffix={t(k("in"))} onChangeText={(v) => { setOwn(v); const n = Math.round(Number(v) * DENOM) / DENOM; const ok = v.trim() !== "" && n > 0 && n <= 24; setOwnBad(!ok); if (ok) put(n); }} label={t(k("offsetOwn"))} />
          </View>
          {ownBad ? <View testID={`attr-offset${sfx}-own-bad`}><StatusChip status="warn" label={t(k("badOffset"))} soft /></View> : null}
        </View>
      ) : null}
      {rest.length ? <View testID={`attr-offset${sfx}-rest`}><T v="caption" tone="mut">{t(k("fittingRest"), { list: rest.map((o) => `${inch(String(o.lengthIn))} × ${o.qty}`).join(", ") })}</T></View> : null}
    </View>
  );
}

/** Offsets (founder 09.11, v43): a rect downspout has «Offset A» and «Offset B» rows, a round one a single «Offset» row */
function Offsets({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  return (
    <View testID="attr-offsets" style={{ gap: space[2] }}>
      {offsetStylesOf(ds.shape).map((style) => <OffsetRow key={style} ds={ds} style={style} onAttrs={onAttrs} />)}
    </View>
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
