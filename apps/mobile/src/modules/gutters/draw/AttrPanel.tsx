/**
 * The attribute panel of the canvas (docs/specs/33-gutters-screens.md П21.8 M5c): what the picked run or downspout
 * is made of. One component: on 390 it sits in the core's Sheet, on 820/1280 it is the column on the right of the
 * canvas. Every choice is one edit of the drawing at once (the canvas's «Назад» takes it back, saved 1 s later) —
 * no «Save» button, like the storey. The tape: feet + inches, «Записать» → confidence `taped` (icon + word, rule 2).
 * Colours are words, never swatches (rule 2). The lists are what the company installs and its palette (settings, M7b);
 * an element's own value the company no longer offers stays as one more chip «нет в списке» (spec 33 П22.2 №7).
 */
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { component, space } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Button, ChoiceChips, StatusChip, Stepper, TextField, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { RowView } from "@/ui/surfaces";
import { COLORS, DS_HEADS, DS_SHAPES, ELBOW_STYLES, smallerSizes, MAX_DS_HEIGHT_FT, OFFSETS_IN, elbowsOf, hangerKitsFor, MILL_ONLY, MOUNTS, tapeIn, wallKitsFor, wallOf, WALLS, withCurrent, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { MODULE_CHOICES, type Choices } from "../settings";
import { ftIn } from "../canvas/format";
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
function Stock<A extends { material: string; gauge?: string; finish?: "mill" | "painted"; color?: string }>({ a, set, ch, part = "all" }: { a: A; set: (p: Partial<A>) => void; ch: Choices; /** 390 (П20.9): the colour on top, the rest under «Ещё» */ part?: "all" | "color" | "rest" }) {
  const { t } = useI18n();
  const colorLabel = useColorLabel();
  const materials = withCurrent(ch.offer.materials, a.material);
  const gauges = withCurrent(ch.offer.gauges[a.material] ?? [], a.gauge);
  const palette = withCurrent(ch.palette, a.color);
  const mill = MILL_ONLY.has(a.material);
  const finish = a.finish ?? (a.color ? "painted" : "mill");
  const rest = part !== "color";
  const color = part !== "rest";
  return (
    <>
      {rest ? <Pick label={t(k("material"))} testID="attr-material" offered={ch.offer.materials} items={materials.map((m) => ({ key: m, label: t(k(`m.${m}`)) }))} value={a.material} onChange={(material) => set({ material } as Partial<A>)} /> : null}
      {rest && gauges.length ? <Pick label={t(k("gauge"))} testID="attr-gauge" offered={ch.offer.gauges[a.material]} items={gauges.map((g) => ({ key: g, label: g }))} value={a.gauge ?? gauges[0]!} onChange={(gauge) => set({ gauge } as Partial<A>)} /> : null}
      {rest && !mill ? (
        <Pick label={t(k("finish"))} testID="attr-finish" items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(k(`f.${f}`)) }))} value={finish} onChange={(f) => set({ finish: f } as Partial<A>)} />
      ) : null}
      {color && !mill && finish === "painted" ? (
        <Pick label={t(k("color"))} testID="attr-color" offered={ch.palette} items={palette.map((c) => ({ key: c, label: colorLabel(c) }))} value={a.color ?? palette[0]!} onChange={(color) => set({ color } as Partial<A>)} />
      ) : null}
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
}: { run: DrawnRun; onAttrs: (p: Partial<RunAttrs>) => void; onLength: (lengthIn: number | null) => void; ch?: Choices; corners?: RunCorner[]; onCorner?: (f: FoundCorner, m: CornerChoice["method"] | null) => void; /** 390: what is changed often on top, the rest under «Ещё» (П20.9) */ compact?: boolean }) {
  const { t } = useI18n();
  const a = run.attrs;
  const profiles = withCurrent(ch.offer.profiles, a.profile);
  const sizes = withCurrent(ch.offer.sizes[a.profile] ?? [], a.size);
  const kits = withCurrent(hangerKitsFor(a.profile, ch), a.hanger);
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
      {compact ? (
        <>
      <Pick label={t(k("story"))} testID="attr-story" items={(["1", "2", "3", "4"] as const).map((n) => ({ key: n, label: t("mod.gutters.story", { n }) }))} value={String(storyOf(a.story)) as "1"} onChange={(n) => onAttrs({ story: Number(n) })} />
      <Pick label={t(k("size"))} testID="attr-size" offered={ch.offer.sizes[a.profile]} items={sizes.map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
        <Stock a={a} set={onAttrs} ch={ch} part="color" />
      <Tape run={run} onLength={onLength} />
          <More open0={false} id={run.id} label={t(k("moreRun"))}>
      <Pick label={t(k("profile"))} testID="attr-profile" offered={ch.offer.profiles} items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
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
      <Pick label={t(k("profile"))} testID="attr-profile" offered={ch.offer.profiles} items={profiles.map((p) => ({ key: p, label: t(k(`p.${p}`)) }))} value={a.profile} onChange={(profile) => onAttrs({ profile })} />
      <Pick label={t(k("size"))} testID="attr-size" offered={ch.offer.sizes[a.profile]} items={sizes.map((s) => ({ key: s, label: inch(s) }))} value={a.size} onChange={(size) => onAttrs({ size })} />
      <Stock a={a} set={onAttrs} ch={ch} />
      <Pick label={t(k("mount"))} testID="attr-mount" items={MOUNTS.map((m) => ({ key: m, label: t(k(`mt.${m}`)) }))} value={a.mount ?? "fascia"} onChange={(mount) => onAttrs({ mount })} />
      <Pick label={t(k("hanger"))} testID="attr-hanger" offered={hangerKitsFor(a.profile, ch)} items={kits.map((id) => ({ key: id, label: t(k(`k.${id}`)) }))} value={a.hanger} onChange={(hanger) => onAttrs({ hanger })} />
      {onCorner ? <Corners corners={corners} onCorner={onCorner} /> : null}
        </>
      )}
    </>
  );
}

export function DsAttrsView({ ds, onAttrs, ch = MODULE_CHOICES, compact }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void; ch?: Choices; compact?: boolean }) {
  const { t } = useI18n();
  const e = elbowsOf(ds);
  const w = wallOf(ds.shape, ds.wall);
  const sizes = withCurrent(ch.offer.dsSizes[ds.shape], ds.size);
  const styles = withCurrent(ch.offer.dsStyles, ds.dsStyle ?? "plain");
  const bottoms = withCurrent(ch.offer.bottoms, ds.bottom.kind);
  const wallKits = withCurrent(wallKitsFor(ds.shape, w.wall, ch), w.kit);
  return (
    <>
      <T v="heading" w="semibold">{t(k("ds"))}</T>
      {compact ? (
        <>
      <Pick label={t(k("size"))} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} items={sizes.map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
          <Stock a={ds} set={onAttrs} ch={ch} part="color" />
      <View testID="attr-elbow-qty">
        <Stepper label={t(k("elbowQty"))} value={e.qty} min={0} max={12} onChange={(qty) => onAttrs({ elbows: [{ style: e.style, qty }] })} />
      </View>
          <More open0={rareSet(ds)} id={ds.id} label={t(k("moreDs"))}>
      <Pick label={t(k("shape"))} testID="attr-shape" items={DS_SHAPES.map((s) => ({ key: s, label: t(k(`sh.${s}`)) }))} value={ds.shape} onChange={(shape) => onAttrs({ shape })} />
      <Pick label={t(k("dsStyle"))} testID="attr-ds-style" offered={ch.offer.dsStyles} items={styles.map((s) => ({ key: s, label: t(k(`st.${s}`)) }))} value={ds.dsStyle ?? "plain"} onChange={(dsStyle) => onAttrs({ dsStyle: dsStyle as DsAttrs["dsStyle"] })} />
            <Stock a={ds} set={onAttrs} ch={ch} part="rest" />
      <Pick label={t(k("elbows"))} testID="attr-elbows" items={ELBOW_STYLES[ds.shape].map((s) => ({ key: s, label: elbow(s) }))} value={e.style} onChange={(style) => onAttrs({ elbows: [{ style, qty: e.qty }] })} />
      <Pick label={t(k("bottom"))} testID="attr-bottom" offered={ch.offer.bottoms} items={bottoms.map((b) => ({ key: b, label: t(k(`b.${b}`)) }))} value={ds.bottom.kind} onChange={(kind) => onAttrs({ bottom: { ...ds.bottom, kind } })} />
      <Pick label={t(k("wall"))} testID="attr-wall" items={WALLS.map((x) => ({ key: x, label: t(k(`w.${x}`)) }))} value={w.wall} onChange={(wall) => onAttrs({ wall })} />
      <Pick label={t(k("wallKit"))} testID="attr-wall-kit" offered={wallKitsFor(ds.shape, w.wall, ch)} items={wallKits.map((id) => ({ key: id, label: t(k(`wk.${id}`)) }))} value={w.kit} onChange={(kit) => onAttrs({ wall: kit })} />
            <DsRare ds={ds} onAttrs={onAttrs} />
          </More>
        </>
      ) : (
        <>
      <Pick label={t(k("shape"))} testID="attr-shape" items={DS_SHAPES.map((s) => ({ key: s, label: t(k(`sh.${s}`)) }))} value={ds.shape} onChange={(shape) => onAttrs({ shape })} />
      <Pick label={t(k("size"))} testID="attr-ds-size" offered={ch.offer.dsSizes[ds.shape]} items={sizes.map((s) => ({ key: s, label: dsSize(s) }))} value={ds.size} onChange={(size) => onAttrs({ size })} />
      <Pick label={t(k("dsStyle"))} testID="attr-ds-style" offered={ch.offer.dsStyles} items={styles.map((s) => ({ key: s, label: t(k(`st.${s}`)) }))} value={ds.dsStyle ?? "plain"} onChange={(dsStyle) => onAttrs({ dsStyle: dsStyle as DsAttrs["dsStyle"] })} />
      <Stock a={ds} set={onAttrs} ch={ch} />
      <Pick label={t(k("elbows"))} testID="attr-elbows" items={ELBOW_STYLES[ds.shape].map((s) => ({ key: s, label: elbow(s) }))} value={e.style} onChange={(style) => onAttrs({ elbows: [{ style, qty: e.qty }] })} />
      <View testID="attr-elbow-qty">
        <Stepper label={t(k("elbowQty"))} value={e.qty} min={0} max={12} onChange={(qty) => onAttrs({ elbows: [{ style: e.style, qty }] })} />
      </View>
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

/**
 * The rare fields of a downspout behind «Ещё» (M7c, debt of M5c №9): its own height, offsets, a size change on the way
 * down, what sits on top, a rain-barrel diverter, an outlet screen. «Ещё» opens by itself when one of them is set.
 */
const rareSet = (ds: DrawnDownspout) => !!(ds.heightIn || ds.offsets?.length || ds.reducers?.length || ds.head || ds.funnel || ds.diverter || ds.outletScreen);

function DsRare({ ds, onAttrs }: { ds: DrawnDownspout; onAttrs: (p: Partial<DsAttrs>) => void }) {
  const { t } = useI18n();
  const off = ds.offsets?.[0];
  const offLen = String(off?.lengthIn ?? OFFSETS_IN[0]) as `${(typeof OFFSETS_IN)[number]}`;
  const head = ds.head ?? (ds.funnel ? "funnel" : "none");
  const smaller = smallerSizes(ds.shape, ds.size);
  return (
    <View style={{ gap: space[4] }}>
      <View testID="attr-height">
        <Stepper label={t(k("height"))} unit={t(k("ft"))} value={Math.round((ds.heightIn ?? 0) / 12)} min={0} max={MAX_DS_HEIGHT_FT} onChange={(ft) => onAttrs({ heightIn: ft ? ft * 12 : undefined })} />
        <T v="caption" tone="mut">{t(k("heightHint"))}</T>
      </View>
      {/* the count makes offsets; the length is picked only once there are some (review M7c №6) */}
      <View testID="attr-offset-qty">
        <Stepper label={t(k("offsetQty"))} value={off?.qty ?? 0} min={0} max={8} onChange={(qty) => onAttrs({ offsets: qty ? [{ lengthIn: Number(offLen), qty }] : undefined })} />
      </View>
      {off?.qty ? (
        <Pick label={t(k("offsets"))} testID="attr-offset-len" items={OFFSETS_IN.map((n) => ({ key: String(n) as typeof offLen, label: inch(String(n)) }))} value={offLen} onChange={(v) => onAttrs({ offsets: [{ lengthIn: Number(v), qty: off.qty }] })} />
      ) : null}
      <Pick label={t(k("reducer"))} testID="attr-reducer" items={[{ key: "", label: t(k("reducerNone")) }, ...smaller.map((s) => ({ key: s, label: dsSize(s) }))]} value={ds.reducers?.[0]?.to ?? ""} onChange={(to) => onAttrs({ reducers: to ? [{ to, qty: 1 }] : undefined })} />
      <Pick label={t(k("head"))} testID="attr-head" items={DS_HEADS.map((h) => ({ key: h, label: t(k(`h.${h}`)) }))} value={head} onChange={(h) => onAttrs({ head: h === "none" ? undefined : h, funnel: undefined })} />
      <Switch testID="attr-diverter" on={!!ds.diverter} onChange={(v) => onAttrs({ diverter: v || undefined })} label={t(k("diverter"))} />
      <Switch testID="attr-outlet-screen" on={!!ds.outletScreen} onChange={(v) => onAttrs({ outletScreen: v || undefined })} label={t(k("outletScreen"))} />
    </View>
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
