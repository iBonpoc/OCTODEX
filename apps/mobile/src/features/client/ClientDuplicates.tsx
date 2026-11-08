import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { statusIcon } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { Customer } from "@/data/types";
import { canMarkNotDuplicate, canMergeClients, canSeeClientDups, defaultKeep, duplicatesOf, mergeSummary, type ClientDup } from "@/features/clientDuplicates";
import { statusOf } from "@/features/clients";
import { useI18n, type DictKey } from "@/i18n";
import { Button, ChoiceChips } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { CardGrid, ListCard } from "@/ui/listCard";
import { RowView } from "@/ui/surfaces";

/**
 * «Возможный дубль» on the client card (docs/specs/04 §13): every other live client with the same phone, email or address —
 * related objects, compact cards (rule 12). Tap → the sheet: which card stays, what moves, «Слить» (owner / admin) after
 * a confirmation, «Не дубль» (the office), «Открыть». The office's only: a tech sees nothing here.
 */
export function ClientDupCards({ c }: { c: Customer }) {
  const { db, role } = useStore();
  const { t } = useI18n();
  const [open, setOpen] = useState<ClientDup | null>(null);
  const dups = useMemo(() => (canSeeClientDups(role) ? duplicatesOf(db, c.id) : []), [role, db.customers, db.properties, c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!dups.length) return null;
  return (
    <>
      <CardGrid>
        {dups.map((d) => (
          <ListCard
            key={d.customer.id}
            density="compact"
            testID={`client-dup-${d.customer.id}`}
            lead={{ kind: "icon", icon: statusIcon.warn, tone: "warn" }}
            title={t("clientDup.title", { name: d.customer.name })}
            when={[d.reasons.map((r) => t(`clientDup.why.${r}` as DictKey)).join(", "), d.customer.number].filter(Boolean).join(" · ")}
            edge="warn"
            onPress={() => setOpen(d)}
          />
        ))}
      </CardGrid>
      {open ? <MergeSheet here={c} other={open.customer} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function MergeSheet({ here, other, onClose }: { here: Customer; other: Customer; onClose: () => void }) {
  const store = useStore();
  const { db, role } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [keep, setKeep] = useState(() => defaultKeep(db, here.id, other.id));
  const [asking, setAsking] = useState(false);
  useEffect(() => setAsking(false), [keep]);
  const kept = keep === here.id ? here : other;
  const drop = keep === here.id ? other : here;
  const s = mergeSummary(db, drop.id);
  // only what is there: «людей 1, объектов 1», not a row of zeros
  const what = (Object.keys(s) as (keyof typeof s)[])
    .filter((k) => s[k] > 0)
    .map((k) => t(`clientDup.n.${k}` as DictKey, { n: s[k] }))
    .join(", ");
  const dns = statusOf(here) === "do_not_service" || statusOf(other) === "do_not_service";
  const merge = () => {
    const undo = store.mergeCustomers(kept.id, drop.id);
    onClose();
    // the card on screen went into the other: show the one that stays
    if (drop.id === here.id) router.replace(`/client/${kept.id}`);
    toast.show(t("clientDup.done", { name: kept.name }), undo);
  };
  const notDup = () => {
    const undo = store.markNotDuplicate(here.id, other.id);
    onClose();
    toast.show(t("clientDup.notDupDone", { name: other.name }), undo);
  };
  return (
    <Sheet visible onClose={onClose} title={t("clientDup.sheetTitle")}>
      <T v="caption" tone="mut">
        {t("clientDup.keep")}
      </T>
      <ChoiceChips<string>
        value={keep}
        onChange={setKeep}
        items={[here, other].map((x) => ({ key: x.id, label: [x.name, x.number].filter(Boolean).join(" · ") }))}
      />
      <T v="body">{t("clientDup.moves", { name: kept.name, what: what || t("clientDup.n.none") })}</T>
      <T v="caption" tone="mut">
        {t("clientDup.fill")}
      </T>
      {dns ? (
        <T v="caption" tone="mut">
          {t("clientDup.noService")}
        </T>
      ) : null}
      {asking ? (
        <>
          <T v="body">{t("clientDup.confirm", { name: drop.name })}</T>
          <RowView>
            <Button label={t("clientDup.confirmYes")} icon="check" variant="danger" onPress={merge} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setAsking(false)} />
          </RowView>
        </>
      ) : canMergeClients(role) ? (
        <Button label={t("clientDup.merge")} icon="check" onPress={() => setAsking(true)} />
      ) : (
        <T v="caption" tone="mut">
          {t("clientDup.onlyOwner")}
        </T>
      )}
      <RowView style={{ flexWrap: "wrap" }}>
        {canMarkNotDuplicate(role) ? <Button label={t("clientDup.notDup")} variant="secondary" onPress={notDup} /> : null}
        <Button
          label={t("clientDup.open", { name: other.name })}
          variant="ghost"
          onPress={() => {
            onClose();
            router.push(`/client/${other.id}`);
          }}
        />
      </RowView>
    </Sheet>
  );
}
