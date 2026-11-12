/**
 * The head of the measurement's card (spec 33 П25.3 Б1, PR-H2): whom it is for and where, its state (the same word as
 * on «Замеры», П25.4) and how it was measured; a press on «whom» → «Привязать к другому» / «Отвязать (в черновики)»
 * (the same functions as the canvas's «⋯»); «⋯» → «Точность замера», «Дублировать», «Удалить» (a signed estimate on it —
 * the item is there, the press says why not). The module not active (S0b): the card only looks — no «⋯», no relink.
 */
import { useRef, useState, type ElementRef } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { uid } from "@/features/estimateDoc";
import { estimateStatusView } from "@/features/estimateStatus";
import { moduleActive, moduleHref } from "@/modules/registry";
import { ChoiceChips, IconButton, StatusChip } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import type { MeasurementRow } from "../canvas/model";
import { duplicateMeasurement, KEY, relink, removeMeasurement, setAccuracy } from "../data";
import { signedOn } from "../estimateLink";
import { measurementState } from "../measurements";
import { LinkSheet } from "../draw/LinkSheet";

type Anchor = { x: number; y: number; w: number; h: number };
type MoreKey = "acc" | "dup" | "delete";
type WhoKey = "relink" | "unlink";

export function CardHead({ m, drawn, onGone }: { m: MeasurementRow; drawn: boolean; /** the card's measurement was deleted: leave it */ onGone: () => void }) {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const db = store.db;
  const canSave = moduleActive(db.company, KEY);
  const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
  const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
  const client = prop ? db.customers.find((c) => c.id === prop.customerId) : undefined;
  const linked = !!lead || !!prop;
  const who = client?.name ?? (lead ? t("mod.gutters.list.lead", { name: lead.name }) : t("mod.gutters.list.noClient"));
  const where = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : lead?.address;
  const v = measurementState(db, m, drawn);
  const est = v.estimate ? estimateStatusView(v.estimate.status) : null;
  const tape = m.accuracy === "tape";

  const whoRef = useRef<ElementRef<typeof View>>(null);
  const moreRef = useRef<ElementRef<typeof View>>(null);
  const [whoAt, setWhoAt] = useState<Anchor | null>(null);
  const [moreAt, setMoreAt] = useState<Anchor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const at = (r: { current: ElementRef<typeof View> | null }, set: (a: Anchor) => void) => r.current?.measureInWindow((x: number, y: number, w: number, h: number) => set({ x, y, w, h }));

  const onWho = (k: WhoKey) => {
    if (k === "relink") setLinkOpen(true);
    else toast.show(t("mod.gutters.link.unlinked"), relink(store, m.id, null) ?? undefined);
  };
  const onMore = (k: MoreKey) => {
    if (k === "acc") return setAccOpen(true);
    if (k === "dup") {
      const r = duplicateMeasurement(store, m.id, uid);
      if (!r) return toast.show(t("mod.gutters.est.off"));
      toast.show(t("mod.gutters.card.copied"), r.undo);
      router.push(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(r.id)}` as Href);
      return;
    }
    if (signedOn(db, m.id)) return toast.show(t("mod.gutters.draw.deleteSigned"));
    const undo = removeMeasurement(store, m.id);
    onGone();
    toast.show(t("mod.gutters.draw.mDeleted"), undo ?? undefined);
  };

  const stateChip =
    v.state === "signed" ? <StatusChip status="ok" label={t("mod.gutters.list.s.signed")} />
    : est ? <StatusChip status={est.s} label={t(est.l)} />
    : <StatusChip status="neutral" label={t(v.state === "unlinked" ? "mod.gutters.list.draft" : "mod.gutters.list.s.noEstimate")} />;

  const whoText = (
    <View style={{ flexShrink: 1, gap: space[1] }}>
      <RowView gap={space[1]}>
        <T v="heading" w="semibold" numberOfLines={2} tone={linked ? undefined : "mut"} style={{ flexShrink: 1 }}>
          {who}
        </T>
        {linked && canSave ? <Icon name="chevronDown" /> : null}
      </RowView>
      {where ? (
        <T v="body" tone="mut" numberOfLines={2}>
          {where}
        </T>
      ) : null}
    </View>
  );

  return (
    <View testID="view-head" style={{ gap: space[2] }}>
      <RowView style={{ justifyContent: "space-between", alignItems: "flex-start", gap: space[2] }}>
        {linked && canSave ? (
          <View ref={whoRef} collapsable={false} testID="view-who" style={{ flexShrink: 1 }}>
            <Press onPress={() => at(whoRef, setWhoAt)} accessibilityRole="button" accessibilityLabel={`${who}. ${t("mod.gutters.card.whoHint")}`}>
              {whoText}
            </Press>
          </View>
        ) : (
          <View testID="view-who" style={{ flexShrink: 1 }}>{whoText}</View>
        )}
        {canSave ? (
          <View ref={moreRef} collapsable={false} testID="view-more">
            <IconButton icon="more" label={t("mod.gutters.card.more")} onPress={() => at(moreRef, setMoreAt)} />
          </View>
        ) : null}
      </RowView>
      <RowView gap={space[2]} style={{ flexWrap: "wrap" }}>
        <View testID="view-state">{stateChip}</View>
        {v.changed ? (
          <View testID="view-changed">
            <StatusChip status="warn" label={t(v.state === "signed" ? "mod.gutters.list.s.changedSigned" : "mod.gutters.list.s.changed")} />
          </View>
        ) : null}
        {v.engineChanged ? (
          <View testID="view-engine-changed">
            <StatusChip status="warn" label={t(v.state === "signed" ? "mod.gutters.list.s.engineSigned" : "mod.gutters.list.s.engine")} />
          </View>
        ) : null}
        <View testID="view-accuracy">
          <StatusChip status={tape ? "ok" : "warn"} soft label={t(tape ? "mod.gutters.card.tape" : "mod.gutters.card.rough")} />
        </View>
      </RowView>

      <Menu
        visible={!!whoAt}
        anchor={whoAt}
        items={[
          { key: "relink" as const, label: t("mod.gutters.link.relink") },
          { key: "unlink" as const, label: t("mod.gutters.link.unlink") },
        ]}
        onSelect={onWho}
        onClose={() => setWhoAt(null)}
      />
      <Menu
        visible={!!moreAt}
        anchor={moreAt}
        items={[
          { key: "acc" as const, label: t("mod.gutters.draw.accItem") },
          { key: "dup" as const, label: t("mod.gutters.card.duplicate") },
          { key: "delete" as const, label: t("mod.gutters.draw.mDelete"), destructive: true },
        ]}
        onSelect={onMore}
        onClose={() => setMoreAt(null)}
      />
      <LinkSheet visible={linkOpen} onClose={() => setLinkOpen(false)} measurementId={m.id} />
      <Sheet visible={accOpen} onClose={() => setAccOpen(false)} title={t("mod.gutters.draw.accItem")}>
        <View testID="view-accuracy-pick" style={{ gap: space[2] }}>
          <ChoiceChips
            items={(["rough", "tape"] as const).map((a) => ({ key: a, label: t(a === "tape" ? "mod.gutters.draw.accTape" : "mod.gutters.draw.accRough") }))}
            value={tape ? "tape" : "rough"}
            onChange={(a) => setAccuracy(store, m.id, a)}
          />
          <T v="caption" tone="mut">{t("mod.gutters.draw.accHint")}</T>
        </View>
      </Sheet>
    </View>
  );
}
