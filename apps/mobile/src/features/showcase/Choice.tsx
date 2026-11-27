import { space } from "@octo/design-tokens";
import { useState } from "react";
import { View } from "react-native";
import { localUndo } from "@/data/undo";
import { useI18n } from "@/i18n";
import { Button, StatusChip } from "@/ui/controls";
import { MetaLine } from "@/ui/metaLine";
import { SelectField } from "@/ui/selectField";
import { DoneCircle } from "@/ui/doneCircle";
import { FracKeys, type FracKey } from "@/ui/fracKeys";
import { ActionRow, MultiValueField, type MultiValue } from "@/ui/multiValueField";
import { OptionRows } from "@/ui/optionRow";
import { OptionTiles } from "@/ui/optionTile";
import { PctUsdField, type PctUsdUnit } from "@/ui/pctUsdField";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { ToggleRow } from "@/ui/toggleRow";
import { useToast } from "@/ui/overlays";
import { SECTIONS } from "./registry";

type Who = "me" | "crew" | "nobody";
type Tag = "vip" | "warranty" | "repeat";
type PhoneLabel = "mobile" | "home" | "work" | "other";

/**
 * «Выбор» (DS §9, spec 56 wave 1а): the choice controls live — OptionRow (one and several), OptionTile, ToggleRow, PctUsdField,
 * MultiValueField, DoneCircle, FracKeys; CheckMark is in each of them. e2e 451 presses every one by its testID.
 */
export function ChoiceSection() {
  const { t } = useI18n();
  const toast = useToast();
  const s = SECTIONS.find((x) => x.id === "choice")!;
  const [who, setWho] = useState<Who | null>("crew");
  const [tags, setTags] = useState<Tag[]>(["vip"]);
  const [corner, setCorner] = useState<"out" | "in">("out");
  const [dsKind, setDsKind] = useState<"rectPlain" | "rectRibbed" | "roundPlain" | "roundRibbed">("rectPlain");
  const [unlinked, setUnlinked] = useState(false);
  const [billing, setBilling] = useState(false);
  const [billTo, setBillTo] = useState<"manager" | "owner" | null>(null);
  const [allDay, setAllDay] = useState(true);
  const [unit, setUnit] = useState<PctUsdUnit>("pct");
  const [bps, setBps] = useState(4000);
  const [cents, setCents] = useState(1000);
  const [inexact, setInexact] = useState(false);
  const [phones, setPhones] = useState<MultiValue<PhoneLabel>[]>([{ id: "p1", label: "mobile", value: "(626) 555-0142" }]);
  const [nextId, setNextId] = useState(2);
  const [done, setDone] = useState<Record<string, boolean>>({ a: true, b: false });
  const [frac, setFrac] = useState<FracKey>("3/8");
  const whoItems = [
    { key: "me" as const, title: t("ds.ch.row.me"), icon: "user" as const },
    { key: "crew" as const, title: t("ds.ch.row.crew"), subtitle: t("ds.ch.row.crewSub"), icon: "users" as const },
    { key: "nobody" as const, title: t("ds.ch.row.nobody") },
  ];
  const labels: { key: PhoneLabel; label: string }[] = [
    { key: "mobile", label: t("ds.ch.mv.mobile") },
    { key: "home", label: t("ds.ch.mv.home") },
    { key: "work", label: t("ds.ch.mv.work") },
    { key: "other", label: t("ds.ch.mv.other") },
  ];
  const doneN = Object.values(done).filter(Boolean).length;
  return (
    <View testID="showcase-choice" style={{ gap: space[3] }}>
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        <T v="heading">{t("ds.ch.row.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.row.hint")}</T>
        <OptionRows testID="showcase-option-row" label={t("ds.ch.row.assign")} items={whoItems} value={who} onChange={setWho} />
        <View testID="showcase-option-row-picked">
          <T v="caption">{t("ds.ch.row.picked", { name: whoItems.find((i) => i.key === who)?.title ?? "—" })}</T>
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.multi.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.multi.hint")}</T>
        <OptionRows
          multiple
          testID="showcase-option-multi"
          label={t("ds.ch.multi.label")}
          items={[
            { key: "vip", title: t("ds.ch.multi.vip") },
            { key: "warranty", title: t("ds.ch.multi.warranty") },
            { key: "repeat", title: t("ds.ch.multi.repeat") },
          ]}
          value={tags}
          onChange={setTags}
        />
        <View testID="showcase-option-multi-count">
          <T v="caption">{t("ds.ch.multi.count", { n: tags.length })}</T>
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.tile.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.tile.hint")}</T>
        <OptionTiles
          testID="showcase-option-tile"
          label={t("ds.ch.tile.label")}
          items={[
            { key: "out", label: t("ds.ch.tile.out"), icon: "cornerOut" },
            { key: "in", label: t("ds.ch.tile.in"), icon: "cornerIn" },
          ]}
          value={unlinked ? null : corner}
          onChange={(k) => {
            setCorner(k);
            setUnlinked(false);
          }}
          action={{ label: t("ds.ch.tile.unlink"), icon: "unlink", onPress: () => setUnlinked(true) }}
        />
        {unlinked ? (
          <View testID="showcase-option-tile-unlinked">
            <T v="caption">{t("ds.ch.tile.unlinked")}</T>
          </View>
        ) : null}
        {/* a trade module's window (#2980): four tiles with icons, no action */}
        <T v="caption" tone="mut">{t("ds.ch.tile.kindHint")}</T>
        <OptionTiles
          testID="showcase-option-tile-kind"
          label={t("ds.ch.tile.kindLabel")}
          items={[
            { key: "rectPlain", label: t("ds.ch.tile.k.rectPlain"), icon: "dsRect" },
            { key: "rectRibbed", label: t("ds.ch.tile.k.rectRibbed"), icon: "dsRectRibbed" },
            { key: "roundPlain", label: t("ds.ch.tile.k.roundPlain"), icon: "dsRound" },
            { key: "roundRibbed", label: t("ds.ch.tile.k.roundRibbed"), icon: "dsRoundRibbed" },
          ]}
          value={dsKind}
          onChange={setDsKind}
        />
      </Card>
      {/* a sample card like the others; what the row turns on is a menu field (a text field in a card is a form on a plate, DS §11 п.17) */}
      <Card>
        <T v="heading">{t("ds.ch.toggle.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.toggle.hint")}</T>
        <ToggleRow testID="showcase-toggle-row" label={t("ds.ch.toggle.billing")} caption={t("ds.ch.toggle.billingCaption")} value={billing} onChange={setBilling}>
          <SelectField
            testID="showcase-toggle-row-street"
            label={t("ds.ch.toggle.street")}
            value={billTo}
            onChange={setBillTo}
            items={[
              { key: "manager", label: t("ds.ch.toggle.toManager") },
              { key: "owner", label: t("ds.ch.toggle.toOwner") },
            ]}
          />
        </ToggleRow>
        <ToggleRow testID="showcase-toggle-allday" label={t("ds.ch.toggle.allDay")} value={allDay} onChange={setAllDay} />
        <ToggleRow testID="showcase-toggle-disabled" label={t("ds.ch.toggle.locked")} value disabled onChange={() => {}} />
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.pct.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.pct.hint")}</T>
        <PctUsdField
          testID="showcase-pct-usd"
          label={t("ds.ch.pct.label")}
          unit={unit}
          onUnit={(u) => {
            setUnit(u);
            setInexact(false);
          }}
          value={unit === "pct" ? bps : cents}
          onChange={unit === "pct" ? setBps : setCents}
          perUnitLabel="/ hr"
          secondLine={t(unit === "pct" ? "ds.ch.pct.secondPct" : "ds.ch.pct.secondUsd")}
          inexact={inexact ? { pct: "12.32", price: "$1,234.56", dir: "more", onPct: () => (setUnit("pct"), setInexact(false)), onKeep: () => setInexact(false) } : null}
        />
        {unit === "usd" && !inexact ? <Button variant="ghost" size="sm" label={t("ds.ch.pct.inexact")} onPress={() => setInexact(true)} testID="showcase-pct-usd-ask" /> : null}
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.mv.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.mv.hint")}</T>
        <MultiValueField
          testID="showcase-multi-value"
          rows={phones}
          labels={labels}
          valueType="phone"
          placeholder="(555) 555-0100"
          addLabel={t("ds.ch.mv.add")}
          removeLabel={t("ds.ch.mv.remove")}
          menuTitle={t("ds.ch.mv.menu")}
          onChange={(id, patch) => setPhones((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
          onRemove={(id) => {
            const before = phones;
            setPhones((p) => p.filter((r) => r.id !== id));
            toast.show(t("ds.ch.mv.removed"), localUndo(() => setPhones(before)));
          }}
          onAdd={() => {
            setPhones((p) => [...p, { id: `p${nextId}`, label: "mobile", value: "" }]);
            setNextId((n) => n + 1);
          }}
          actionsFor={(r, i) => (i > 0 ? [{ key: "main", label: t("ds.ch.mv.main"), onPress: () => setPhones((p) => [r, ...p.filter((x) => x.id !== r.id)]) }] : [])}
        />
        {/* the red row of a dangerous action (iOS «Контакты»: «Удалить контакт»), with «Вернуть» in the toast */}
        <ActionRow testID="showcase-action-row-bad" tone="bad" label={t("cw4.deleteContact")} onPress={() => toast.show(t("cw4.contactRemoved"), localUndo(() => undefined))} />
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.meta.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.meta.hint")}</T>
        <MetaLine
          testID="showcase-meta-line"
          fixed={[<StatusChip key="s" status="ok" label={t("ds.ch.meta.status")} />]}
          tags={["VIP", "Pool", "Solar", "Two dogs", "Gate code", "Weekends"].map((x) => ({ id: x, label: x }))}
          onTags={() => toast.show(t("ds.ch.meta.tapped"))}
          tagsLabel={t("ds.ch.meta.title")}
          moreLabel={(n) => t("cw4.moreTags", { n })}
        />
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.done.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.done.hint")}</T>
        <DoneCircle testID="showcase-done-a" label={t("ds.ch.done.a")} title={t("ds.ch.done.a")} done={!!done.a} onChange={(v) => setDone((d) => ({ ...d, a: v }))} />
        <DoneCircle testID="showcase-done-b" label={t("ds.ch.done.b")} title={t("ds.ch.done.b")} done={!!done.b} onChange={(v) => setDone((d) => ({ ...d, b: v }))} />
        <T v="caption" tone="mut">{t("ds.ch.done.count", { n: doneN, m: 2 })}</T>
      </Card>
      <Card>
        <T v="heading">{t("ds.ch.frac.title")}</T>
        <T v="caption" tone="mut">{t("ds.ch.frac.hint")}</T>
        <FracKeys testID="showcase-frac-keys" value={frac} onKey={setFrac} />
        <View testID="showcase-frac-typed">
          <T v="body" tabular>{t("ds.ch.frac.typed", { frac })}</T>
        </View>
      </Card>
    </View>
  );
}
