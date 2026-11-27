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
import { IconButton, StatusChip } from "@/ui/controls";
import { Icon, Press, T } from "@/ui/primitives";
import { Menu, Sheet, useToast } from "@/ui/overlays";
import { RowView } from "@/ui/surfaces";
import type { MeasurementRow } from "../canvas/model";
import { duplicateMeasurement, KEY, relink } from "../data";
import { deleteBlock, estimatesOn, otherEstimates, removeMeasurementDetached } from "../estimateLink";
import type { ModuleEstimateStore } from "@/modules/registry";
import { DeleteMeasurementSheet, NO_ESTIMATES } from "./DeleteMeasurementSheet";
import { measurementState } from "../measurements";
import { LinkSheet } from "../draw/LinkSheet";

type Anchor = { x: number; y: number; w: number; h: number };
type MoreKey = "dup" | "crew" | "delete";
type WhoKey = "relink" | "unlink";

export function CardHead({ m, drawn, onGone, onCrewDocs }: { m: MeasurementRow; drawn: boolean; /** the card's measurement was deleted: leave it */ onGone: () => void; /** «Документы бригады» (#2989): the cut and the shop drawings, off the card */ onCrewDocs?: () => void }) {
  const store = useStore();
  const deleter = { role: store.role, me: store.db.me };
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

  const whoRef = useRef<ElementRef<typeof View>>(null);
  const moreRef = useRef<ElementRef<typeof View>>(null);
  const [whoAt, setWhoAt] = useState<Anchor | null>(null);
  const [moreAt, setMoreAt] = useState<Anchor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const at = (r: { current: ElementRef<typeof View> | null }, set: (a: Anchor) => void) => r.current?.measureInWindow((x: number, y: number, w: number, h: number) => set({ x, y, w, h }));

  const onWho = (k: WhoKey) => {
    if (k === "relink") setLinkOpen(true);
    else toast.show(t("mod.gutters.link.unlinked"), relink(store, m.id, null) ?? undefined);
  };
  const onMore = (k: MoreKey) => {
    if (k === "crew") return onCrewDocs?.();
    if (k === "dup") {
      const r = duplicateMeasurement(store, m.id, uid);
      if (!r) return toast.show(t("mod.gutters.est.off"));
      toast.show(t("mod.gutters.card.copied"), r.undo);
      router.push(`${moduleHref("gutters", "view")}?m=${encodeURIComponent(r.id)}` as Href);
      return;
    }
    const block = deleteBlock(db, m.id, deleter);
    if (block) return toast.show(t(block === "signed" ? "mod.gutters.draw.deleteSigned" : "mod.gutters.del.notYours"));
    // an open estimate stands on it: asked first (#2013), the question holds what it said while it goes out; none — at once
    const on = estimatesOn(db, m.id);
    if (on.drafts.length || on.sent.length) return setAskDelete(on);
    doDelete();
  };
  const [askDelete, setAskDelete] = useState<ReturnType<typeof estimatesOn> | null>(null);
  /** one deletion at a time: a second press writes nothing and never puts an empty «Отменить» over the first one's (rule 5) */
  const deleting = useRef(false);
  const doDelete = () => {
    setAskDelete(null);
    if (deleting.current) return;
    // asked again at the press: signed meanwhile (the client on /p/) or not this person's to change — never deleted
    const block = deleteBlock(store.db, m.id, deleter);
    if (block) return toast.show(t(block === "signed" ? "mod.gutters.draw.deleteSigned" : "mod.gutters.del.notYours"));
    deleting.current = true;
    const undo = removeMeasurementDetached(store as unknown as ModuleEstimateStore, m.id, deleter);
    if (!undo) {
      deleting.current = false;
      return toast.show(t("mod.gutters.est.off"));
    }
    onGone();
    toast.show(t("mod.gutters.draw.mDeleted"), undo);
  };

  const stateChip =
    v.state === "signed" ? <StatusChip status="ok" label={t("mod.gutters.list.s.signed")} />
    : est ? <StatusChip status={est.s} draft={est.d} label={t(est.l)} />
    : <StatusChip status="neutral" draft={v.state === "unlinked"} label={t(v.state === "unlinked" ? "mod.gutters.list.draft" : otherEstimates(db, m).length ? "mod.gutters.card.noEstHere" : "mod.gutters.list.s.noEstimate")} />;

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
        {canSave || onCrewDocs ? (
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
          <View testID={v.state === "signed" ? "view-engine-signed" : "view-engine-changed"}>
            <StatusChip status="warn" label={t(v.state === "signed" ? "mod.gutters.list.s.engineSigned" : "mod.gutters.list.s.engine")} />
          </View>
        ) : null}
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
          ...(onCrewDocs ? [{ key: "crew" as const, label: t("mod.gutters.card.crewDocs"), testID: "view-more-crew" }] : []),
          // the module not active (S0b): the card only looks — the crew's documents, no copy, no delete
          ...(canSave ? [
            { key: "dup" as const, label: t("mod.gutters.card.duplicate") },
            { key: "delete" as const, label: t("mod.gutters.draw.mDelete"), destructive: true, testID: "view-more-delete" },
          ] : []),
        ]}
        onSelect={onMore}
        onClose={() => setMoreAt(null)}
      />
      <LinkSheet visible={linkOpen} onClose={() => setLinkOpen(false)} measurementId={m.id} />
      <DeleteMeasurementSheet visible={!!askDelete} on={askDelete ?? NO_ESTIMATES} onDelete={doDelete} onClose={() => setAskDelete(null)} />
    </View>
  );
}
