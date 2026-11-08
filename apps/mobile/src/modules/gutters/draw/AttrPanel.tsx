/**
 * The attribute panel of the canvas (docs/specs/33-gutters-screens.md П21.8 M5c): what the picked run or downspout
 * is made of. One component: on 390 it sits in the core's Sheet, on 820/1280 it is the column on the right of the
 * canvas. Every choice is one edit of the drawing at once (the canvas's «Назад» takes it back, saved 1 s later) —
 * no «Save» button, like the storey. The tape: feet + inches, «Записать» → confidence `taped` (icon + word, rule 2).
 * Colours are words, never swatches (rule 2); the lists are the module's until the company's settings (M7).
 */
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, StatusChip, Stepper, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import {
  COLORS, DS_BOTTOMS, DS_SHAPES, DS_SIZES, DS_STYLES, ELBOW_STYLES, elbowsOf, GAUGES_BY_MATERIAL, hangerKitsFor, MATERIALS, MILL_ONLY, MOUNTS, PROFILES,
  SIZES_BY_PROFILE, tapeIn, wallKitsFor, wallOf, WALLS, type DsAttrs, type RunAttrs,
} from "../canvas/attrs";
import { ftIn } from "../canvas/format";
import { storyOf } from "../canvas/scene";
import { drawnLengthIn, type DrawnDownspout, type DrawnRun } from "../geometry";

const k = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
const dsSize = (s: string) => (s.includes("x") ? s.replace("x", "×") : inch(s));
const elbow = (s: string) => (/^\d+$/.test(s) ? `${s}°` : s);

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{label}</T>
      {children}
    </View>
  );
}

/** a choice of words: the stored value and its label */
function Pick<K extends string>({ label, testID, items, value, onChange }: { label: string; testID: string; items: { key: K; label: string }[]; value: K; onChange: (v: K) => void }) {
  return (
    <Field label={label} testID={testID}>
      <ChoiceChips items={items} value={value} onChange={onChange} />
    </Field>
  );
}

/** the tape: feet and inches; «Записать» sets the length, «По рисунку» puts the drawn one back */
function Tape({ run, onLength }: { run: DrawnRun; onLength: (lengthIn: number | null) => void }) {
  const { t } = useI18n();
  const cur = run.lengthIn ?? drawnLengthIn(run);
  const [ft, setFt] = useState(String(Math.floor(cur / 12)));
  const [inc, setInc] = useState(String(cur % 12));
  const [bad, setBad] = useState(false);
  // another run picked, «Назад», or a dragged end: the fields show the length it has now
  useEffect(() => {
    setFt(String(Math.floor(cur / 12)));
    setInc(String(cur % 12));
    setBad(false);
  }, [run.id, cur]);
  const apply = () => {
    const n = tapeIn(ft, inc);
    setBad(n === null);
    if (n !== null) onLength(n);
  };
  const taped = run.lengthIn !== undefined;
  return (
    <Field label={t(k("length"))} testID="attr-length">
      <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-ft">
          <TextField type="integer" value={ft} onChangeText={setFt} label={t(k("ft"))} onSubmit={apply} />
        </View>
        <T v="body" tone="mut">{t(k("ft"))}</T>
        <View style={{ width: component.qtyFieldW }} testID="attr-length-in">
          <TextField type="integer" value={inc} onChangeText={setInc} label={t(k("in"))} onSubmit={apply} />
        </View>
        <T v="body" tone="mut">{t(k("in"))}</T>
        <View testID="attr-length-apply"><Button label={t(k("apply"))} size="sm" variant="secondary" onPress={apply} /></View>
        {taped ? <View testID="attr-length-reset"><Button label={t(k("reset"))} size="sm" variant="ghost" onPress={() => onLength(null)} /></View> : null}
      </RowView>
      {bad ? <View testID="attr-length-bad"><StatusChip status="warn" label={t(k("badLength"))} soft /></View> : null}
    </Field>
  );
}

/** stock shared by runs and downspouts: material → gauge; paint → colour (copper and zinc are bare) */
function Stock<A extends { material: string; gauge?: string; finish?: "mill" | "painted"; color?: string }>({ a, set }: { a: A; set: (p: Partial<A>) => void }) {
  const { t } = useI18n();
  const gauges = GAUGES_BY_MATERIAL[a.material] ?? [];
  const mill = MILL_ONLY.has(a.material);
  const finish = a.finish ?? (a.color ? "painted" : "mill");
  return (
    <>
      <Pick label={t(k("material"))} testID="attr-material" items={MATERIALS.map((m) => ({ key: m, label: t(k(`m.${m}`)) }))} value={a.material as (typeof MATERIALS)[number]} onChange={(material) => set({ material } as Partial<A>)} />
      {gauges.length ? <Pick label={t(k("gauge"))} testID="attr-gauge" items={gauges.map((g) => ({ key: g, label: g }))} value={a.gauge ?? gauges[0]!} onChange={(gauge) => set({ gauge } as Partial<A>)} /> : null}
      {!mill ? (
        <Pick label={t(k("finish"))} testID="attr-finish" items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(k(`f.${f}`)) }))} value={finish} onChange={(f) => set({ finish: f } as Partial<A>)} />
      ) : null}
      {!mill && finish === "painted" ? (
        <Pick label={t(k("color"))} testID="attr-color" items={COLORS.map((c) => ({ key: c, label: t(k(`c.${c}`)) }))} value={(a.color ?? COLORS[0]) as (typeof COLORS)[number]} onChange={(color) => set({ color } as Partial<A>)} />
      ) : null}
    </>
  );
}

export function RunAttrsView({ run, onAttrs, onLength }: { run: DrawnRun; onAttrs: (p: Partial<RunAttrs>) => void; onLength: (lengthIn: number | null) => void }) {
  const { t } = useI18n();
  const a = run.attrs;
  const taped = run.lengthIn !== undefined;
  return (
    <>
      <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
        <T v="heading" w="semibold">{`${t(k("run"))} · ${ftIn(run.lengthIn ?? drawnLengthIn(run))}`}</T>
        <View testID="attr-confidence">
          {/* icon + word (rule 2): the tape is a measured length, the drawing a sketch */}
          <StatusChip status={taped ? "ok" : "neutral"} label={t(k(taped ? "taped" : "drawn"))} />
        </View>
      </RowView>
      <Tape run={run} onLength={onLength} />
      <Pick label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />
      <Pick label={t(k("profile"))} testID="attr-profile" items={PROFILES.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
      <Pick label={t(k("size"))} testID="attr-size" items={SIZES_BY_PROFILE[a.profile].map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
      <Stock a={a} set={onAttrs} />
      <Pick label={t(k("mount"))} testID="attr-mount" items={MOUNTS.map((m) => ({ key: m, label: t(k(`mt.${m}`)) }))} value={a.mount ?? "fascia"} onChange={(mount) => onAttrs({ mount })} />
      <Pick label={t(k("hanger"))} testID="attr-hanger" items={hangerKitsFor(a.profile).map((id) => ({ key: id, label: t(k(`k.${id}`)) }))} value={a.hanger} onChange={(hanger) => onAttrs({ hanger })} />
    </>
  );
}

export function DsAttrsView({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const e = elbowsOf(ds);
  const w = wallOf(ds.shape, ds.wall);
  return (
    <>
      <T v="heading" w="semibold">{t(k("ds"))}</T>
      <Pick label={t(k("shape"))} testID="attr-shape" items={DS_SHAPES.map((s) => ({ key: s, label: t(k(`sh.${s}`)) }))} value={ds.shape} onChange={(shape) => onAttrs({ shape })} />
      <Pick label={t(k("size"))} testID="attr-ds-size" items={DS_SIZES[ds.shape].map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
      <Pick label={t(k("dsStyle"))} testID="attr-ds-style" items={DS_STYLES.map((s) => ({ key: s, label: t(k(`st.${s}`)) }))} value={ds.dsStyle ?? "plain"} onChange={(dsStyle) => onAttrs({ dsStyle })} />
      <Stock a={ds} set={onAttrs} />
      <Pick label={t(k("elbows"))} testID="attr-elbows" items={ELBOW_STYLES[ds.shape].map((s) => ({ key: s, label: elbow(s) }))} value={e.style} onChange={(style) => onAttrs({ elbows: [{ style, qty: e.qty }] })} />
      <View testID="attr-elbow-qty">
        <Stepper label={t(k("elbowQty"))} value={e.qty} min={0} max={12} onChange={(qty) => onAttrs({ elbows: [{ style: e.style, qty }] })} />
      </View>
      <Pick label={t(k("bottom"))} testID="attr-bottom" items={DS_BOTTOMS.map((b) => ({ key: b, label: t(k(`b.${b}`)) }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Pick label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
      <Pick label={t(k("wallKit"))} testID="attr-wall-kit" items={wallKitsFor(ds.shape, w.wall).map((id) => ({ key: id, label: t(k(`wk.${id}`)) }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
    </>
  );
}

/** the panel's body: scrolls on its own (the sheet and the side column both hold it) */
export function AttrBody({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }} testID="attr-panel">
      {children}
    </ScrollView>
  );
}
