/**
 * «Компания → Модули → Gutters → Настройки» (docs/specs/33-gutters-settings.md П22, M7b): what the company installs,
 * its colour palette and the defaults of a new run and downspout — in plain words, each part with an explanation.
 * The director (owner / admin) changes them; the office sees them read-only and whom to ask. Every change is saved at
 * once (company_modules.settings through the core's queue, offline too — rule 6) with «Отменить» 5 s (rule 5).
 * The module switched off or past its trial: the page is read-only with «Подключить» (founder О2).
 * Colours are words, never swatches (rule 2).
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { GUTTER_MOUNTS } from "@octo/estimating-engine";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { moduleState } from "@/modules/registry";
import { Button, ChoiceChips, IconButton, ReadOnly, StatusChip, Stepper, TextField, Toggle, useReadOnly } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { useToast } from "@/ui/overlays";
import { Card, RowView, Screen } from "@/ui/surfaces";
import { DS_BOTTOMS, DS_SHAPES, DS_SIZES, DS_STYLES, GAUGES_BY_MATERIAL, MATERIALS, MILL_ONLY, PROFILES, SIZES_BY_PROFILE, WALL_KITS_BY_WALL, WALLS } from "../canvas/attrs";
import { useColorLabel } from "../draw/AttrPanel";
import {
  choicesFor, colorName, CORNER_METHODS, familyKits, GUARD_KINDS, JOINT_KINDS, MAX_PALETTE, MODULE_OFFER, PALETTES, readRules, readUse, RULE_NUMS, settingsFit, setSetting, STICK_FT, USE_NUMS, type Choices,
} from "../settings";

const a = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const k = (s: string) => `mod.gutters.set.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
const dsSize = (s: string) => (s.includes("x") ? s.replace("x", "×") : inch(s));

function Part({ title, hint, children, testID }: { title: string; hint: string; children: React.ReactNode; testID: string }) {
  return (
    <View testID={testID}>
      <Card>
        <T v="heading">{title}</T>
        <T v="caption" tone="mut">{hint}</T>
        {children}
      </Card>
    </View>
  );
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

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID: string }) {
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{label}</T>
      {children}
    </View>
  );
}

/**
 * Checkboxes as chips: the look of ChoiceChips (ink frame on the surface, «✓» and bold when checked). The core's
 * MultiChips fills checked chips with the accent — a page of them would be all yellow, and yellow is kept for the one
 * main action (rule 2). TODO(ui): move into src/ui as MultiChips' look (a «Лиды и клиенты» file) — said in the PR.
 */
function MultiChips<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K[]; onChange: (v: K[]) => void }) {
  const ro = useReadOnly();
  const { c } = useTheme();
  const h = component.button.sm;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {items.map((it) => {
        const sel = value.includes(it.key);
        return (
          <Press
            key={it.key}
            onPress={() => onChange(sel ? value.filter((x) => x !== it.key) : [...value, it.key])}
            disabled={ro}
            visibleHeight={h}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sel, disabled: ro }}
            {...({ "aria-checked": sel } as object)}
            accessibilityLabel={it.label}
            style={{ height: h, paddingHorizontal: space[3], borderRadius: radius.pill, justifyContent: "center", backgroundColor: c.surf2, borderWidth: sel ? component.selectedBorder : 1, borderColor: sel ? c.ink : c.bd }}
          >
            <T v="button" w={sel ? "bold" : undefined} style={{ color: sel ? c.ink : c.mut }}>
              {sel ? "✓ " : ""}
              {it.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}

export default function GutterSettingsScreen() {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const colorLabel = useColorLabel();
  const cm = store.db.company?.modules?.gutters;
  const raw = cm?.settings;
  const ch: Choices = useMemo(() => choicesFor(raw), [raw]);
  const rules = useMemo(() => readRules(raw), [raw]);
  const use = useMemo(() => readUse(raw), [raw]);
  const [newColor, setNewColor] = useState("");
  const access = moduleState(cm).access;
  const active = access === "trial" || access === "paid";
  const director = store.role === "director";
  const ro = !director || !active;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company/modules"));

  /** one change: the stored settings with it, saved at once; too large or the module off → nothing saved, said why */
  const save = (next: Record<string, unknown>) => {
    if (!settingsFit(next)) return toast.show(t(k("tooLarge")));
    const undo = store.saveModuleSettings("gutters", next);
    if (undo) toast.show(store.online ? t(k("saved")) : t("offline.queued"), undo);
  };
  /** a list from the «what we install» part: at least one stays (the panel needs something to offer) */
  const setOffer = (key: string, list: string[]) => (list.length ? save(setSetting(raw, "offer", key, list)) : toast.show(t(k("keepOne"))));
  const setNested = (key: string, sub: string, list: string[], all: Record<string, string[]>) =>
    list.length ? save(setSetting(raw, "offer", key, { ...all, [sub]: list })) : toast.show(t(k("keepOne")));
  /** a default: stored as the whole resolved default, so what is shown is what is kept (no stale size of another profile) */
  const setRun = (p: Record<string, unknown>) => save(setSetting(raw, "run", null, choicesFor(setSetting(raw, "run", null, { ...ch.run, ...p })).run));
  const setDs = (p: Record<string, unknown>) => save(setSetting(raw, "ds", null, choicesFor(setSetting(raw, "ds", null, { ...ch.ds, ...p })).ds));
  const setPalette = (list: string[]) => save(setSetting(raw, "palette", null, list));
  const setRule = (key: string, v: unknown) => save(setSetting(raw, "rules", key, v));
  const setUse = (key: string, v: unknown) => save(setSetting(raw, "use", key, v));
  /** a number rule as a stepper: its unit, range and step (spec П4); the default is said under it */
  const num = (key: keyof typeof RULE_NUMS, unit: string, label: string, setter = setRule, value = rules[key as keyof typeof rules] as number, r = RULE_NUMS[key]) => (
    <View testID={`gset-rule-${key}`}>
      <Stepper label={label} unit={unit} value={value} min={r.min} max={r.max} step={r.step} onChange={(v) => setter(key, v)} />
    </View>
  );
  const addColor = () => {
    const n = colorName(newColor);
    if (!n) return;
    if (ch.palette.some((c) => c.toLowerCase() === n.toLowerCase())) return toast.show(t(k("colorTaken")));
    if (ch.palette.length >= MAX_PALETTE) return toast.show(t(k("paletteFull"), { n: MAX_PALETTE }));
    setPalette([...ch.palette, n]);
    setNewColor("");
  };

  const offer = ch.offer;
  const sizesOffer = offer.sizes as Record<string, string[]>;
  const gaugesOffer = offer.gauges;
  const dsOffer = offer.dsSizes as Record<string, string[]>;
  const runProfile = ch.run.profile;
  const runGauges = offer.gauges[ch.run.material] ?? [];
  const dsGauges = offer.gauges[ch.ds.material] ?? [];

  return (
    <Screen title={t(k("title"))} back={back} subtitle={t("mod.gutters.title")}>
      <View style={{ gap: space[4] }} testID="gset-screen">
        <T v="body" tone="mut">{t(k("intro"))}</T>
        {!active ? (
          <View testID="gset-locked" style={{ gap: space[2] }}>
            <StatusChip status="warn" label={t(k("locked"))} />
            {director ? <Button label={t("mod.gutters.draw.connect")} variant="secondary" onPress={() => router.push("/company/modules")} /> : null}
          </View>
        ) : !director ? (
          <View testID="gset-ro">
            <StatusChip status="info" label={t(k("askOwner"))} />
          </View>
        ) : null}

        <ReadOnly value={ro}>
          <Part title={t(k("offer"))} hint={t(k("offerHint"))} testID="gset-offer">
            <Field label={t(k("profiles"))} testID="gset-profiles">
              <MultiChips items={PROFILES.map((p) => ({ key: p, label: t(a(`p.${p}`)) }))} value={offer.profiles} onChange={(v) => setOffer("profiles", v)} />
            </Field>
            {offer.profiles.map((p) => (
              <Field key={p} label={t(k("sizesOf"), { what: t(a(`p.${p}`)) })} testID={`gset-sizes-${p}`}>
                <MultiChips items={SIZES_BY_PROFILE[p].map((s) => ({ key: s, label: inch(s) }))} value={offer.sizes[p]} onChange={(v) => setNested("sizes", p, v, sizesOffer)} />
              </Field>
            ))}
            <Field label={t(k("materials"))} testID="gset-materials">
              <MultiChips items={MATERIALS.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={offer.materials} onChange={(v) => setOffer("materials", v)} />
            </Field>
            {offer.materials.filter((m) => (GAUGES_BY_MATERIAL[m] ?? []).length).map((m) => (
              <Field key={m} label={t(k("gaugesOf"), { what: t(a(`m.${m}`)) })} testID={`gset-gauges-${m}`}>
                <MultiChips items={(GAUGES_BY_MATERIAL[m] ?? []).map((g) => ({ key: g, label: g }))} value={offer.gauges[m] ?? []} onChange={(v) => setNested("gauges", m, v, gaugesOffer)} />
              </Field>
            ))}
            {/* two families (spec П18.6): the half-round kits hang half round and euro, the rest K, fascia and box; each keeps one */}
            {(["k", "half_round"] as const).map((fam) => {
              const kits = familyKits(fam);
              const other = offer.hangers.filter((id) => !kits.includes(id));
              return (
                <Field key={fam} label={t(k(fam === "k" ? "hangersK" : "hangersHR"))} testID={`gset-hangers-${fam}`}>
                  <MultiChips
                    items={kits.map((id) => ({ key: id, label: t(a(`k.${id}`)) }))}
                    value={offer.hangers.filter((id) => kits.includes(id))}
                    onChange={(v) => (v.length ? save(setSetting(raw, "offer", "hangers", [...other, ...v])) : toast.show(t(k("keepOne"))))}
                  />
                </Field>
              );
            })}
            {DS_SHAPES.map((sh) => (
              <Field key={sh} label={t(k("dsSizesOf"), { what: t(a(`sh.${sh}`)) })} testID={`gset-ds-${sh}`}>
                <MultiChips items={DS_SIZES[sh].map((s) => ({ key: s, label: dsSize(s) }))} value={offer.dsSizes[sh]} onChange={(v) => setNested("dsSizes", sh, v, dsOffer)} />
              </Field>
            ))}
            <Field label={t(k("dsStyles"))} testID="gset-ds-styles">
              <MultiChips items={DS_STYLES.map((s) => ({ key: s, label: t(a(`st.${s}`)) }))} value={offer.dsStyles} onChange={(v) => setOffer("dsStyles", v)} />
            </Field>
            <Field label={t(k("bottoms"))} testID="gset-bottoms">
              <MultiChips items={DS_BOTTOMS.map((b) => ({ key: b, label: t(a(`b.${b}`)) }))} value={offer.bottoms} onChange={(v) => setOffer("bottoms", v)} />
            </Field>
            <Field label={t(k("wallKits"))} testID="gset-wall-kits">
              <MultiChips items={MODULE_OFFER.wallKits.map((id) => ({ key: id, label: t(a(`wk.${id}`)) }))} value={offer.wallKits} onChange={(v) => setOffer("wallKits", v)} />
            </Field>
          </Part>

          <Part title={t(k("palette"))} hint={t(k("paletteHint"))} testID="gset-palette">
            <View style={{ gap: space[1] }}>
              {ch.palette.map((c, i) => (
                <RowView key={`${c}-${i}`} style={{ justifyContent: "space-between" }}>
                  <View testID={`gset-color-${i}`} style={{ flex: 1 }}>
                    <T v="body">{colorLabel(c)}</T>
                  </View>
                  {ro || ch.palette.length < 2 ? null : (
                    <View testID={`gset-color-${i}-remove`}>
                      <IconButton icon="close" label={t(k("colorRemove"), { name: colorLabel(c) })} onPress={() => setPalette(ch.palette.filter((_, j) => j !== i))} />
                    </View>
                  )}
                </RowView>
              ))}
            </View>
            {ro ? null : (
              <>
                <RowView style={{ gap: space[2] }}>
                  <View style={{ flex: 1 }} testID="gset-color-new">
                    <TextField type="title" value={newColor} onChangeText={setNewColor} placeholder={t(k("colorNew"))} label={t(k("colorNew"))} onSubmit={addColor} />
                  </View>
                  <View testID="gset-color-add">
                    <Button label={t(k("colorAdd"))} size="sm" variant="secondary" onPress={addColor} />
                  </View>
                </RowView>
                <T v="caption" tone="mut">{t(k("paletteFrom"))}</T>
                <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
                  <View testID="gset-palette-berger">
                    <Button label={t(k("palBerger"), { n: PALETTES.berger.length })} size="sm" variant="secondary" onPress={() => setPalette([...PALETTES.berger])} />
                  </View>
                  <View testID="gset-palette-sp">
                    <Button label={t(k("palSP"), { n: PALETTES.servicePartners.length })} size="sm" variant="secondary" onPress={() => setPalette([...PALETTES.servicePartners])} />
                  </View>
                  <View testID="gset-palette-module">
                    <Button label={t(k("palModule"))} size="sm" variant="ghost" onPress={() => save(setSetting(raw, "palette", null, undefined))} />
                  </View>
                </RowView>
              </>
            )}
          </Part>

          <Part title={t(k("rules"))} hint={t(k("rulesHint"))} testID="gset-rules">
            {num("storyFt", t(k("ft")), t(k("r.storyFt")))}
            {num("hangerSpacingIn", t(k("in")), t(k("r.hangerSpacingIn")))}
            <Switch testID="gset-rule-hangerExtra" on={rules.hangerExtra} onChange={(v) => setRule("hangerExtra", v)} label={t(k("r.hangerExtra"))} />
            {num("wastePct", "%", t(k("r.wastePct")))}
            {num("cutCornerIn", t(k("in")), t(k("r.cutCornerIn")))}
            <Field label={t(k("r.corner"))} testID="gset-rule-corner">
              <ChoiceChips items={CORNER_METHODS.map((m) => ({ key: m, label: t(a(`cm.${m}`)) }))} value={rules.corner} onChange={(m) => setRule("corner", m)} />
            </Field>
            <Field label={t(k("r.seamless"))} testID="gset-rule-seamless">
              <ChoiceChips items={[{ key: "1", label: t(k("r.seamlessYes")) }, { key: "0", label: t(k("r.seamlessNo")) }]} value={rules.seamless ? "1" : "0"} onChange={(v) => setRule("seamless", v === "1")} />
            </Field>
            {num("runPerDsFt", t(k("ft")), t(k("r.runPerDsFt")))}
            {num("expansionFt", t(k("ft")), t(k("r.expansionFt")))}
            <Switch testID="gset-rule-expansionPart" on={rules.expansionPart} onChange={(v) => setRule("expansionPart", v)} label={t(k("r.expansionPart"))} />
            <Field label={t(k("r.dsStickFt"))} testID="gset-rule-dsStickFt">
              <ChoiceChips items={STICK_FT.map((n) => ({ key: String(n), label: `${n} ${t(k("ft"))}` }))} value={String(rules.dsStickFt)} onChange={(v) => setRule("dsStickFt", Number(v))} />
            </Field>
            <Switch testID="gset-rule-dsShareOffcuts" on={rules.dsShareOffcuts} onChange={(v) => setRule("dsShareOffcuts", v)} label={t(k("r.dsShareOffcuts"))} />
            {num("dsExtensionIn", t(k("in")), t(k("r.dsExtensionIn")))}
            <Field label={t(k("r.rainBasis"))} testID="gset-rule-rainBasis">
              <ChoiceChips items={(["smacna", "code"] as const).map((b) => ({ key: b, label: t(k(`r.rain.${b}`)) }))} value={rules.rainBasis} onChange={(b) => setRule("rainBasis", b)} />
              <T v="caption" tone="mut">{t(k("r.rainHint"))}</T>
            </Field>
          </Part>

          <Part title={t(k("use"))} hint={t(k("useHint"))} testID="gset-use">
            {JOINT_KINDS.map((j) => (
              <Field key={j} label={t(k(`j.${j}`))} testID={`gset-joint-${j}`}>
                <Stepper label={t(k("u.rivets"))} value={use.joints[j].rivets} min={USE_NUMS.rivets.min} max={USE_NUMS.rivets.max} onChange={(v) => setUse("joints", { ...use.joints, [j]: { ...use.joints[j], rivets: v } })} />
                <Stepper label={t(k("u.sealant"))} value={use.joints[j].sealant} min={USE_NUMS.sealant.min} max={USE_NUMS.sealant.max} onChange={(v) => setUse("joints", { ...use.joints, [j]: { ...use.joints[j], sealant: v } })} />
              </Field>
            ))}
            <View testID="gset-use-pointsPerTube">
              <Stepper label={t(k("u.pointsPerTube"))} value={use.pointsPerTube} min={USE_NUMS.pointsPerTube.min} max={USE_NUMS.pointsPerTube.max} onChange={(v) => setUse("pointsPerTube", v)} />
            </View>
            <View testID="gset-use-solder">
              <Stepper label={t(k("u.solder"))} value={use.solderPointsPerLb} min={USE_NUMS.solderPointsPerLb.min} max={USE_NUMS.solderPointsPerLb.max} onChange={(v) => setUse("solderPointsPerLb", v)} />
            </View>
            <Switch testID="gset-use-paint" on={use.touchUpPaint} onChange={(v) => setUse("touchUpPaint", v)} label={t(k("u.paint"))} />
            <Field label={t(k("u.dsJoin"))} testID="gset-use-dsJoin">
              <ChoiceChips items={(["rivet", "screw"] as const).map((x) => ({ key: x, label: t(k(`u.join.${x}`)) }))} value={use.dsJoin} onChange={(x) => setUse("dsJoin", x)} />
            </Field>
            {GUARD_KINDS.map((g) => (
              <View key={g} testID={`gset-use-guard-${g}`}>
                <Stepper label={t(k("u.guardPiece"), { what: t(k(`g.${g}`)) })} unit={t(k("ft"))} value={use.guardPieceFt[g]!} min={USE_NUMS.guardPieceFt.min} max={USE_NUMS.guardPieceFt.max} onChange={(v) => setUse("guardPieceFt", { ...use.guardPieceFt, [g]: v })} />
              </View>
            ))}
          </Part>

          <Part title={t(k("defRun"))} hint={t(k("defRunHint"))} testID="gset-def-run">
            <Field label={t(a("profile"))} testID="gset-run-profile">
              <ChoiceChips items={offer.profiles.map((p) => ({ key: p, label: t(a(`p.${p}`)) }))} value={ch.run.profile} onChange={(profile) => setRun({ profile })} />
            </Field>
            <Field label={t(a("size"))} testID="gset-run-size">
              <ChoiceChips items={offer.sizes[runProfile].map((s) => ({ key: s, label: inch(s) }))} value={ch.run.size} onChange={(size) => setRun({ size })} />
            </Field>
            <Field label={t(a("material"))} testID="gset-run-material">
              <ChoiceChips items={offer.materials.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={ch.run.material} onChange={(material) => setRun({ material })} />
            </Field>
            {runGauges.length ? (
              <Field label={t(a("gauge"))} testID="gset-run-gauge">
                <ChoiceChips items={runGauges.map((g) => ({ key: g, label: g }))} value={ch.run.gauge ?? runGauges[0]!} onChange={(gauge) => setRun({ gauge })} />
              </Field>
            ) : null}
            {MILL_ONLY.has(ch.run.material) ? null : (
              <Field label={t(a("finish"))} testID="gset-run-finish">
                <ChoiceChips items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(a(`f.${f}`)) }))} value={ch.run.finish} onChange={(finish) => setRun({ finish })} />
              </Field>
            )}
            {ch.run.finish === "painted" ? (
              <Field label={t(a("color"))} testID="gset-run-color">
                <ChoiceChips items={ch.palette.map((c) => ({ key: c, label: colorLabel(c) }))} value={ch.run.color ?? ch.palette[0]!} onChange={(color) => setRun({ color })} />
              </Field>
            ) : null}
            <Field label={t(a("mount"))} testID="gset-run-mount">
              <ChoiceChips items={GUTTER_MOUNTS.map((m) => ({ key: m, label: t(a(`mt.${m}`)) }))} value={ch.run.mount} onChange={(mount) => setRun({ mount })} />
            </Field>
            <T v="caption" tone="mut">{t(k("byMountHint"), { what: t(a(`p.${runProfile}`)) })}</T>
            {GUTTER_MOUNTS.map((m) => {
              const kits = familyKits(runProfile, offer.hangers);
              return (
                <Field key={m} label={t(a(`mt.${m}`))} testID={`gset-mount-${m}`}>
                  <ChoiceChips
                    items={(kits.length ? kits : familyKits(runProfile)).map((id) => ({ key: id, label: t(a(`k.${id}`)) }))}
                    value={ch.hangerByMount[runProfile][m]}
                    onChange={(kit) => save(setSetting(raw, "hangerByMount", runProfile, { ...ch.hangerByMount[runProfile], [m]: kit }))}
                  />
                </Field>
              );
            })}
          </Part>

          <Part title={t(k("defDs"))} hint={t(k("defDsHint"))} testID="gset-def-ds">
            <Field label={t(a("shape"))} testID="gset-ds-shape">
              <ChoiceChips items={DS_SHAPES.map((s) => ({ key: s, label: t(a(`sh.${s}`)) }))} value={ch.ds.shape} onChange={(shape) => setDs({ shape })} />
            </Field>
            <Field label={t(a("size"))} testID="gset-ds-size">
              <ChoiceChips items={offer.dsSizes[ch.ds.shape].map((s) => ({ key: s, label: dsSize(s) }))} value={ch.ds.size} onChange={(size) => setDs({ size })} />
            </Field>
            <Field label={t(a("dsStyle"))} testID="gset-ds-style">
              <ChoiceChips items={offer.dsStyles.map((s) => ({ key: s, label: t(a(`st.${s}`)) }))} value={ch.ds.dsStyle} onChange={(dsStyle) => setDs({ dsStyle })} />
            </Field>
            <Field label={t(a("material"))} testID="gset-ds-material">
              <ChoiceChips items={offer.materials.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={ch.ds.material} onChange={(material) => setDs({ material })} />
            </Field>
            {dsGauges.length ? (
              <Field label={t(a("gauge"))} testID="gset-ds-gauge">
                <ChoiceChips items={dsGauges.map((g) => ({ key: g, label: g }))} value={ch.ds.gauge ?? dsGauges[0]!} onChange={(gauge) => setDs({ gauge })} />
              </Field>
            ) : null}
            {MILL_ONLY.has(ch.ds.material) ? null : (
              <Field label={t(a("finish"))} testID="gset-ds-finish">
                <ChoiceChips items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(a(`f.${f}`)) }))} value={ch.ds.finish} onChange={(finish) => setDs({ finish })} />
              </Field>
            )}
            {ch.ds.finish === "painted" ? (
              <Field label={t(a("color"))} testID="gset-ds-color">
                <ChoiceChips items={ch.palette.map((c) => ({ key: c, label: colorLabel(c) }))} value={ch.ds.color ?? ch.palette[0]!} onChange={(color) => setDs({ color })} />
              </Field>
            ) : null}
            <Field label={t(a("bottom"))} testID="gset-ds-bottom">
              <ChoiceChips items={offer.bottoms.map((b) => ({ key: b, label: t(a(`b.${b}`)) }))} value={ch.ds.bottom} onChange={(bottom) => setDs({ bottom })} />
            </Field>
            <Field label={t(a("wall"))} testID="gset-ds-wall">
              <ChoiceChips items={WALLS.map((w) => ({ key: w, label: t(a(`w.${w}`)) }))} value={ch.ds.wall} onChange={(wall) => setDs({ wall })} />
            </Field>
            <T v="caption" tone="mut">{t(k("byWallHint"), { what: t(a(`sh.${ch.ds.shape}`)) })}</T>
            {WALLS.map((w) => {
              const all = WALL_KITS_BY_WALL[ch.ds.shape][w];
              const kits = all.filter((id) => offer.wallKits.includes(id));
              return (
                <Field key={w} label={t(a(`w.${w}`))} testID={`gset-wall-${w}`}>
                  <ChoiceChips
                    items={(kits.length ? kits : all).map((id) => ({ key: id, label: t(a(`wk.${id}`)) }))}
                    value={ch.wallKitByWall[ch.ds.shape][w]}
                    onChange={(kit) => save(setSetting(raw, "wallKitByWall", ch.ds.shape, { ...ch.wallKitByWall[ch.ds.shape], [w]: kit }))}
                  />
                </Field>
              );
            })}
          </Part>
        </ReadOnly>
      </View>
    </Screen>
  );
}
