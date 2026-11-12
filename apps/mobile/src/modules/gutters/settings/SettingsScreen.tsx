/**
 * «Компания → Модули → Gutters → Настройки» (docs/specs/33-gutters-settings.md П22, M7b): what the company installs,
 * its colour palette and the defaults of a new run and downspout — in plain words, each part with an explanation.
 * The director (owner / admin) changes them; the office sees them read-only and whom to ask. Every change is saved at
 * once (company_modules.settings through the core's queue, offline too — rule 6) with «Отменить» 5 s (rule 5).
 * The module switched off or past its trial: the page is read-only with «Подключить» (founder О2).
 * Colours are words, never swatches (rule 2).
 */
import { createContext, useContext, useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { GUTTER_MOUNTS } from "@octo/estimating-engine";
import { component, radius, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n, type DictKey } from "@/i18n";
import { moduleHref, moduleState } from "@/modules/registry";
import { ANCHORS, SPIKE_LENGTHS, WOOD_SCREWS } from "@octo/estimating-engine";
import { Button, ChoiceChips, IconButton, ReadOnly, StatusChip, Stepper, TextField, Toggle, useReadOnly } from "@/ui/controls";
import { Press, T } from "@/ui/primitives";
import { useTheme } from "@/theme/ThemeProvider";
import { useToast } from "@/ui/overlays";
import { Card, RowView, Screen } from "@/ui/surfaces";
import { DS_BOTTOMS, DS_SHAPES, DS_SIZES, DS_STYLES, GAUGES_BY_MATERIAL, MATERIALS, MILL_ONLY, PROFILES, SIZES_BY_PROFILE, WALL_KITS_BY_WALL, WALLS } from "../canvas/attrs";
import { fmtLen, LEN_FORMATS } from "../canvas/format";
import { useColorLabel } from "../draw/AttrPanel";
import {
  choicesFor, colorName, DEFAULT_OVERHANG_FT, notSavedKey, OVERHANG_FT, CORNER_METHODS, familyKits, GUARD_KINDS, JOINT_KINDS, SPIKE_SIZES, MAX_PALETTE, MODULE_OFFER, PALETTES, readRules, readUse, RULE_NUMS, setPath, settingsFit, STICK_FT, toggleOffer, USE_NUMS,
  type Choices, type OfferGroup,
} from "../settings";

/** the sample under the choice: 73′ 2½″ */
const LEN_SAMPLE_IN = 73 * 12 + 2.5;
const a = (s: string) => `mod.gutters.attr.${s}` as DictKey;
const k = (s: string) => `mod.gutters.set.${s}` as DictKey;
const inch = (s: string) => `${s}″`;
/** i18n keys of the fastener choices (a value has dots and slashes) */
const SCREW_KEY = { "10x1": "s10x1", "10x1.5": "s10x15", "10x2": "s10x2" } as const;
const ANCHOR_KEY = { masonry: "any", "3/16x7/8": "a316", "1/4x1": "a14" } as const;
const dsSize = (s: string) => (s.includes("x") ? s.replace("x", "×") : inch(s));

/** the refusal or note said under one field (by its testID): the last choice, too large, being read again */
const WarnCtx = createContext<{ at: string; text: string } | null>(null);
function FieldWarn({ at }: { at: string }) {
  const warn = useContext(WarnCtx);
  return warn?.at === at ? (
    <View testID={`${at}-warn`}>
      <StatusChip status="warn" label={warn.text} soft />
    </View>
  ) : null;
}
/** a choice that names its field (a segment or a dropdown) with the refusal said under it (#374: the save was refused, the pick rolled back) */
function ChoiceWarn<K extends string>(p: React.ComponentProps<typeof ChoiceChips<K>> & { testID: string }) {
  return (
    <View style={{ gap: space[2] }}>
      <ChoiceChips {...p} label={p.label} />
      <FieldWarn at={p.testID} />
    </View>
  );
}
/** a stepper with its note under it */
function Step({ testID, children }: { testID: string; children: React.ReactNode }) {
  return (
    <View testID={testID}>
      {children}
      <FieldWarn at={testID} />
    </View>
  );
}

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
    <View style={{ gap: space[1] }}>
      <RowView style={{ gap: space[3], justifyContent: "space-between" }}>
        <T v="body" style={{ flex: 1 }}>{label}</T>
        <View testID={testID}><Toggle on={on} onChange={onChange} label={label} /></View>
      </RowView>
      <FieldWarn at={testID} />
    </View>
  );
}

function Field({ label, children, testID }: { label: string; children: React.ReactNode; testID: string }) {
  return (
    <View style={{ gap: space[2] }} testID={testID}>
      <T v="caption" tone="mut" w="semibold">{label}</T>
      {children}
      <FieldWarn at={testID} />
    </View>
  );
}

/**
 * Checkboxes as chips: the look of ChoiceChips (ink frame on the surface, «✓» and bold when checked). The core's
 * MultiChips fills checked chips with the accent — a page of them would be all yellow, and yellow is kept for the one
 * main action (rule 2). TODO(ui): move into src/ui as MultiChips' look (a «Лиды и клиенты» file) — said in the PR.
 */
function MultiChips<K extends string>({ items, value, onToggle, testID }: { items: { key: K; label: string }[]; value: K[]; onToggle: (k: K) => void; testID: string }) {
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
            onPress={() => onToggle(it.key)}
            testID={`${testID}-${it.key}`}
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

  /**
   * A refusal (the last choice, too large, a colour twice, the palette full) is said under its own field: a toast would
   * take the place of the «Сохранено · Отменить» toast and its undo (rule 5, review #372 №5).
   */
  const [warn, setWarn] = useState<{ at: string; text: string } | null>(null);
  /** one change: the stored settings with it, saved at once; too large or the module off → nothing saved, said why */
  const save = (next: Record<string, unknown>, at: string) => {
    if (!settingsFit(next)) return setWarn({ at, text: t(k("tooLarge")) });
    setWarn(null);
    const undo = store.saveModuleSettings("gutters", next);
    if (undo) toast.show(store.online ? t(k("saved")) : t("offline.queued"), undo);
    // not saved while the module is read again after someone else's change (core #374: null until re-read) — said under
    // the field, not silently (debt №7, spec П22.10 №6)
    else setWarn({ at, text: t(k(notSavedKey(moduleState(store.db.company?.modules?.gutters).access))) });
  };
  /** «what we install»: one value on or off; the last one of its list stays (spec П22.2 №8) */
  const toggle = (at: string, group: OfferGroup, sub: string | null, value: string, known?: readonly string[]) => {
    const next = toggleOffer(raw, group, sub, value, known);
    if (next) save(next, at);
    else setWarn({ at, text: t(k("keepOne")) });
  };
  /** one field of a default, a table cell, a rule: only that field is written (review #372 №2) */
  const put = (at: string, path: string[], value: unknown) => save(setPath(raw, path, value), at);
  const setRun = (key: string, v: unknown) => put(`gset-run-${key}`, ["run", key], v);
  // the field's testID: «gset-ds-style» for dsStyle (the others are «gset-ds-<key>»)
  const setDs = (key: string, v: unknown) => put(`gset-ds-${key === "dsStyle" ? "style" : key}`, ["ds", key], v);
  const setPalette = (list: string[] | undefined) => put("gset-palette", ["palette"], list);
  const setRule = (key: string, v: unknown) => put(`gset-rule-${key}`, ["rules", key], v);
  /** a number rule as a stepper: its unit, range and step (spec П4) */
  const num = (key: keyof typeof RULE_NUMS, unit: string, label: string) => {
    const r = RULE_NUMS[key];
    return (
      <Step testID={`gset-rule-${key}`}>
        <Stepper label={label} unit={unit} value={rules[key]} min={r.min} max={r.max} step={r.step} onChange={(v) => setRule(key, v)} />
      </Step>
    );
  };
  const addColor = () => {
    const n = colorName(newColor);
    if (!n) return;
    if (ch.palette.some((c) => c.toLowerCase() === n.toLowerCase())) return setWarn({ at: "gset-palette", text: t(k("colorTaken")) });
    if (ch.palette.length >= MAX_PALETTE) return setWarn({ at: "gset-palette", text: t(k("paletteFull"), { n: MAX_PALETTE }) });
    setPalette([...ch.palette, n]);
    setNewColor("");
  };

  const offer = ch.offer;
  const runProfile = ch.run.profile;
  const runGauges = offer.gauges[ch.run.material] ?? [];
  const dsGauges = offer.gauges[ch.ds.material] ?? [];

  return (
    <WarnCtx.Provider value={warn}>
    <Screen title={t(k("title"))} back={back} subtitle={t("mod.gutters.title")}>
      <View style={{ gap: space[4] }} testID="gset-screen">
        <T v="body" tone="mut">{t(k("intro"))}</T>
        {!active ? (
          <View testID="gset-locked" style={{ gap: space[2] }}>
            <StatusChip status="warn" label={t(k("locked"))} />
            {director ? <View testID="gset-connect"><Button label={t("mod.gutters.draw.connect")} variant="secondary" onPress={() => router.push("/company/modules")} /></View> : null}
          </View>
        ) : !director ? (
          <View testID="gset-ro">
            <StatusChip status="info" label={t(k("askOwner"))} />
          </View>
        ) : null}

        {/* M7d (spec П22.10): prices live in the company's price list — their own page */}
        <View testID="gset-prices">
          <Card>
            <T v="heading">{t("mod.gutters.pr.title")}</T>
            <T v="caption" tone="mut">{t("mod.gutters.pr.fromSettings")}</T>
            <Button label={t("mod.gutters.pr.open")} icon="box" variant="secondary" size="sm" onPress={() => router.push(moduleHref("gutters", "prices"))} />
          </Card>
        </View>

        <ReadOnly value={ro}>
          {/* #1092: one format for every length — the drawing, the review, the documents, the parts */}
          <Part title={t(k("len"))} hint={t(k("lenHint"))} testID="gset-len">
            <ChoiceWarn label={t(k("lenFormat"))} testID="gset-len-format" items={LEN_FORMATS.map((f) => ({ key: f, label: t(k(`lenf.${f}`)) }))} value={ch.lenFormat} onChange={(f) => put("gset-len-format", ["lenFormat"], f)} />
            <View testID="gset-len-sample"><T v="caption" tone="mut">{t(k("lenSample"), { len: fmtLen(LEN_SAMPLE_IN, ch.lenFormat) })}</T></View>
          </Part>
          {/* #932 (founder 11.11): where the roof's overhang is set */}
          <Part title={t(k("house"))} hint={t(k("houseHint"))} testID="gset-house">
            <ChoiceWarn label={t(k("roofOverhang"))} testID="gset-roof-overhang" items={OVERHANG_FT.map((n) => ({ key: String(n), label: fmtLen(n * 12, ch.lenFormat) }))} value={String(ch.roofOverhangFt)} onChange={(v) => put("gset-roof-overhang", ["roofOverhangFt"], Number(v))} />
            <T v="caption" tone="mut">{t(k("roofOverhangHint"), { def: fmtLen(DEFAULT_OVERHANG_FT * 12, ch.lenFormat) })}</T>
          </Part>
          <Part title={t(k("offer"))} hint={t(k("offerHint"))} testID="gset-offer">
            <Field label={t(k("profiles"))} testID="gset-profiles">
              <MultiChips items={PROFILES.map((p) => ({ key: p, label: t(a(`p.${p}`)) }))} value={offer.profiles} testID="gset-profiles" onToggle={(x) => toggle("gset-profiles", "profiles", null, x)} />
            </Field>
            {offer.profiles.map((p) => (
              <Field key={p} label={t(k("sizesOf"), { what: t(a(`p.${p}`)) })} testID={`gset-sizes-${p}`}>
                <MultiChips items={SIZES_BY_PROFILE[p].map((s) => ({ key: s, label: inch(s) }))} value={offer.sizes[p]} testID={`gset-sizes-${p}`} onToggle={(x) => toggle(`gset-sizes-${p}`, "sizes", p, x)} />
              </Field>
            ))}
            <Field label={t(k("materials"))} testID="gset-materials">
              <MultiChips items={MATERIALS.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={offer.materials} testID="gset-materials" onToggle={(x) => toggle("gset-materials", "materials", null, x)} />
            </Field>
            {offer.materials.filter((m) => (GAUGES_BY_MATERIAL[m] ?? []).length).map((m) => (
              <Field key={m} label={t(k("gaugesOf"), { what: t(a(`m.${m}`)) })} testID={`gset-gauges-${m}`}>
                <MultiChips items={(GAUGES_BY_MATERIAL[m] ?? []).map((g) => ({ key: g, label: g }))} value={offer.gauges[m] ?? []} testID={`gset-gauges-${m}`} onToggle={(x) => toggle(`gset-gauges-${m}`, "gauges", m, x)} />
              </Field>
            ))}
            {/* two families (spec П18.6): the half-round kits hang half round and euro, the rest K, fascia and box; each keeps one */}
            {(["k", "half_round"] as const).map((fam) => {
              const kits = familyKits(fam);
              return (
                <Field key={fam} label={t(k(fam === "k" ? "hangersK" : "hangersHR"))} testID={`gset-hangers-${fam}`}>
                  <MultiChips
                    items={kits.map((id) => ({ key: id, label: t(a(`k.${id}`)) }))}
                    value={offer.hangers.filter((id) => kits.includes(id))}
                    testID={`gset-hangers-${fam}`}
                    onToggle={(x) => toggle(`gset-hangers-${fam}`, "hangers", null, x, kits)}
                  />
                </Field>
              );
            })}
            {DS_SHAPES.map((sh) => (
              <Field key={sh} label={t(k("dsSizesOf"), { what: t(a(`sh.${sh}`)) })} testID={`gset-ds-${sh}`}>
                <MultiChips items={DS_SIZES[sh].map((s) => ({ key: s, label: dsSize(s) }))} value={offer.dsSizes[sh]} testID={`gset-ds-${sh}`} onToggle={(x) => toggle(`gset-ds-${sh}`, "dsSizes", sh, x)} />
              </Field>
            ))}
            <Field label={t(k("dsStyles"))} testID="gset-ds-styles">
              <MultiChips items={DS_STYLES.map((s) => ({ key: s, label: t(a(`st.${s}`)) }))} value={offer.dsStyles} testID="gset-ds-styles" onToggle={(x) => toggle("gset-ds-styles", "dsStyles", null, x)} />
            </Field>
            <Field label={t(k("bottoms"))} testID="gset-bottoms">
              <MultiChips items={DS_BOTTOMS.map((b) => ({ key: b, label: t(a(`b.${b}`)) }))} value={offer.bottoms} testID="gset-bottoms" onToggle={(x) => toggle("gset-bottoms", "bottoms", null, x)} />
            </Field>
            <Field label={t(k("wallKits"))} testID="gset-wall-kits">
              <MultiChips items={MODULE_OFFER.wallKits.map((id) => ({ key: id, label: t(a(`wk.${id}`)) }))} value={offer.wallKits} testID="gset-wall-kits" onToggle={(x) => toggle("gset-wall-kits", "wallKits", null, x)} />
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
                <FieldWarn at="gset-palette" />
                <T v="caption" tone="mut">{t(k("paletteFrom"))}</T>
                <RowView style={{ gap: space[2], flexWrap: "wrap" }}>
                  <View testID="gset-palette-berger">
                    <Button label={t(k("palBerger"), { n: PALETTES.berger.length })} size="sm" variant="secondary" onPress={() => setPalette([...PALETTES.berger])} />
                  </View>
                  <View testID="gset-palette-sp">
                    <Button label={t(k("palSP"), { n: PALETTES.servicePartners.length })} size="sm" variant="secondary" onPress={() => setPalette([...PALETTES.servicePartners])} />
                  </View>
                  <View testID="gset-palette-module">
                    <Button label={t(k("palModule"))} size="sm" variant="ghost" onPress={() => setPalette(undefined)} />
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
                <Stepper label={t(k("u.rivets"))} value={use.joints[j].rivets} min={USE_NUMS.rivets.min} max={USE_NUMS.rivets.max} onChange={(v) => put(`gset-joint-${j}`, ["use", "joints", j, "rivets"], v)} />
                <Stepper label={t(k("u.sealant"))} value={use.joints[j].sealant} min={USE_NUMS.sealant.min} max={USE_NUMS.sealant.max} onChange={(v) => put(`gset-joint-${j}`, ["use", "joints", j, "sealant"], v)} />
              </Field>
            ))}
            <Step testID="gset-use-pointsPerTube">
              <Stepper label={t(k("u.pointsPerTube"))} value={use.pointsPerTube} min={USE_NUMS.pointsPerTube.min} max={USE_NUMS.pointsPerTube.max} onChange={(v) => put("gset-use-pointsPerTube", ["use", "pointsPerTube"], v)} />
            </Step>
            <Step testID="gset-use-solder">
              <Stepper label={t(k("u.solder"))} value={use.solderPointsPerLb} min={USE_NUMS.solderPointsPerLb.min} max={USE_NUMS.solderPointsPerLb.max} onChange={(v) => put("gset-use-solder", ["use", "solderPointsPerLb"], v)} />
            </Step>
            <Switch testID="gset-use-paint" on={use.touchUpPaint} onChange={(v) => put("gset-use-paint", ["use", "touchUpPaint"], v)} label={t(k("u.paint"))} />
            <Field label={t(k("u.dsJoin"))} testID="gset-use-dsJoin">
              <ChoiceChips items={(["rivet", "screw"] as const).map((x) => ({ key: x, label: t(k(`u.join.${x}`)) }))} value={use.dsJoin} onChange={(x) => put("gset-use-dsJoin", ["use", "dsJoin"], x)} />
            </Field>
            {GUARD_KINDS.map((g) => (
              <Step key={g} testID={`gset-use-guard-${g}`}>
                <Stepper label={t(k("u.guardPiece"), { what: t(k(`g.${g}`)) })} unit={t(k("ft"))} value={use.guardPieceFt[g]!} min={USE_NUMS.guardPieceFt.min} max={USE_NUMS.guardPieceFt.max} onChange={(v) => put(`gset-use-guard-${g}`, ["use", "guardPieceFt", g], v)} />
              </Step>
            ))}
            <Switch testID="gset-use-sealantColor" on={use.sealantByColor} onChange={(v) => put("gset-use-sealantColor", ["use", "sealantByColor"], v)} label={t(k("u.sealantColor"))} />
            {use.sealantByColor ? <T v="caption" tone="mut">{t(k("u.rebindHint"))}</T> : null}
            {/* spec П18.15: the supplier's fasteners — sizes only, never a brand; defaults «проверить» */}
            <Field label={t(k("u.woodScrew"))} testID="gset-use-woodScrew">
              <ChoiceChips items={WOOD_SCREWS.map((x) => ({ key: x, label: t(k(`u.screw.${SCREW_KEY[x]}`)) }))} value={use.woodScrew} onChange={(x) => put("gset-use-woodScrew", ["use", "woodScrew"], x)} />
            </Field>
            <Switch testID="gset-use-washer" on={use.washer} onChange={(v) => put("gset-use-washer", ["use", "washer"], v)} label={t(k("u.washer"))} />
            <Field label={t(k("u.anchor"))} testID="gset-use-anchor">
              <ChoiceChips items={ANCHORS.map((x) => ({ key: x, label: t(k(`u.anchor.${ANCHOR_KEY[x]}`)) }))} value={use.anchor} onChange={(x) => put("gset-use-anchor", ["use", "anchor"], x)} />
            </Field>
            <Switch testID="gset-use-spikeBySize" on={use.spikeBySize} onChange={(v) => put("gset-use-spikeBySize", ["use", "spikeBySize"], v)} label={t(k("u.spikeBySize"))} />
            {use.spikeBySize && SPIKE_SIZES.map((sz) => (
              <Field key={sz} label={t(k("u.spike"), { size: inch(sz) })} testID={`gset-use-spike-${sz}`}>
                <ChoiceChips items={SPIKE_LENGTHS.map((x) => ({ key: x, label: inch(x) }))} value={use.spikeLenIn[sz]!} onChange={(x) => put(`gset-use-spike-${sz}`, ["use", "spikeLenIn", sz], x)} />
              </Field>
            ))}
            <T v="caption" tone="mut">{t(k("u.fastenersHint"))}</T>
          </Part>

          <Part title={t(k("defRun"))} hint={t(k("defRunHint"))} testID="gset-def-run">
            <ChoiceWarn label={t(a("profile"))} testID="gset-run-profile" items={offer.profiles.map((p) => ({ key: p, label: t(a(`p.${p}`)) }))} value={ch.run.profile} onChange={(profile) => setRun("profile", profile)} />
            <ChoiceWarn label={t(a("size"))} testID="gset-run-size" items={offer.sizes[runProfile].map((s) => ({ key: s, label: inch(s) }))} value={ch.run.size} onChange={(size) => setRun("size", size)} />
            <ChoiceWarn label={t(a("material"))} testID="gset-run-material" items={offer.materials.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={ch.run.material} onChange={(material) => setRun("material", material)} />
            {runGauges.length ? (
              <ChoiceWarn label={t(a("gauge"))} testID="gset-run-gauge" items={runGauges.map((g) => ({ key: g, label: g }))} value={ch.run.gauge ?? runGauges[0]!} onChange={(gauge) => setRun("gauge", gauge)} />
            ) : null}
            {MILL_ONLY.has(ch.run.material) ? null : (
              <Field label={t(a("finish"))} testID="gset-run-finish">
                <ChoiceChips items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(a(`f.${f}`)) }))} value={ch.run.finish} onChange={(finish) => setRun("finish", finish)} />
              </Field>
            )}
            {ch.run.finish === "painted" ? (
              <Field label={t(a("color"))} testID="gset-run-color">
                <ChoiceChips items={ch.palette.map((c) => ({ key: c, label: colorLabel(c) }))} value={ch.run.color ?? ch.palette[0]!} onChange={(color) => setRun("color", color)} />
              </Field>
            ) : null}
            <Field label={t(a("mount"))} testID="gset-run-mount">
              <ChoiceChips items={GUTTER_MOUNTS.map((m) => ({ key: m, label: t(a(`mt.${m}`)) }))} value={ch.run.mount} onChange={(mount) => setRun("mount", mount)} />
            </Field>
            <T v="caption" tone="mut">{t(k("byMountHint"), { what: t(a(`p.${runProfile}`)) })}</T>
            {GUTTER_MOUNTS.map((m) => {
              const kits = familyKits(runProfile, offer.hangers);
              return (
                <Field key={m} label={t(a(`mt.${m}`))} testID={`gset-mount-${m}`}>
                  <ChoiceChips
                    items={(kits.length ? kits : familyKits(runProfile)).map((id) => ({ key: id, label: t(a(`k.${id}`)) }))}
                    value={ch.hangerByMount[runProfile][m]}
                    onChange={(kit) => put(`gset-mount-${m}`, ["hangerByMount", runProfile, m], kit)}
                  />
                </Field>
              );
            })}
          </Part>

          <Part title={t(k("defDs"))} hint={t(k("defDsHint"))} testID="gset-def-ds">
            <ChoiceWarn label={t(a("shape"))} testID="gset-ds-shape" items={DS_SHAPES.map((s) => ({ key: s, label: t(a(`sh.${s}`)) }))} value={ch.ds.shape} onChange={(shape) => setDs("shape", shape)} />
            <ChoiceWarn label={t(a("size"))} testID="gset-ds-size" items={offer.dsSizes[ch.ds.shape].map((s) => ({ key: s, label: dsSize(s) }))} value={ch.ds.size} onChange={(size) => setDs("size", size)} />
            <ChoiceWarn label={t(a("dsStyle"))} testID="gset-ds-style" items={offer.dsStyles.map((s) => ({ key: s, label: t(a(`st.${s}`)) }))} value={ch.ds.dsStyle} onChange={(dsStyle) => setDs("dsStyle", dsStyle)} />
            <ChoiceWarn label={t(a("material"))} testID="gset-ds-material" items={offer.materials.map((m) => ({ key: m, label: t(a(`m.${m}`)) }))} value={ch.ds.material} onChange={(material) => setDs("material", material)} />
            {dsGauges.length ? (
              <ChoiceWarn label={t(a("gauge"))} testID="gset-ds-gauge" items={dsGauges.map((g) => ({ key: g, label: g }))} value={ch.ds.gauge ?? dsGauges[0]!} onChange={(gauge) => setDs("gauge", gauge)} />
            ) : null}
            {MILL_ONLY.has(ch.ds.material) ? null : (
              <Field label={t(a("finish"))} testID="gset-ds-finish">
                <ChoiceChips items={(["painted", "mill"] as const).map((f) => ({ key: f, label: t(a(`f.${f}`)) }))} value={ch.ds.finish} onChange={(finish) => setDs("finish", finish)} />
              </Field>
            )}
            {ch.ds.finish === "painted" ? (
              <Field label={t(a("color"))} testID="gset-ds-color">
                <ChoiceChips items={ch.palette.map((c) => ({ key: c, label: colorLabel(c) }))} value={ch.ds.color ?? ch.palette[0]!} onChange={(color) => setDs("color", color)} />
              </Field>
            ) : null}
            <Field label={t(a("bottom"))} testID="gset-ds-bottom">
              <ChoiceChips items={offer.bottoms.map((b) => ({ key: b, label: t(a(`b.${b}`)) }))} value={ch.ds.bottom} onChange={(bottom) => setDs("bottom", bottom)} />
            </Field>
            <Field label={t(a("wall"))} testID="gset-ds-wall">
              <ChoiceChips items={WALLS.map((w) => ({ key: w, label: t(a(`w.${w}`)) }))} value={ch.ds.wall} onChange={(wall) => setDs("wall", wall)} />
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
                    onChange={(kit) => put(`gset-wall-${w}`, ["wallKitByWall", ch.ds.shape, w], kit)}
                  />
                </Field>
              );
            })}
          </Part>
        </ReadOnly>
      </View>
    </Screen>
    </WarnCtx.Provider>
  );
}
