import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "@/data/store";
import { canServe, visibleClients } from "@/features/clients";
import { mergedTarget } from "@/features/clientDuplicates";
import { clientRowsFor, isClientSection } from "@/features/clientRows";
import { ClientSection } from "@/features/client/ClientSections";
import { ClientCardBody } from "@/features/client/ClientCard";
import { useI18n, type DictKey } from "@/i18n";
import { Button } from "@/ui/controls";
import { Empty, Screen } from "@/ui/surfaces";

/**
 * Client card (docs/specs/13-app-structure.md §3.3, wave 4). Header: name; one line "CLT-0001 · status · tags";
 * call / SMS / email / route; money (office). Below — not tabs but rows with counters, each opens its own list
 * (`/client/<id>?s=jobs`): properties, billing address, people, jobs, leads, estimates, invoices, tasks, notes, files, history.
 */
export default function ClientScreen() {
  const { id, s } = useLocalSearchParams<{ id: string; s?: string }>();
  const { db, role } = useStore();
  const { t } = useI18n();
  const c = visibleClients(db, role).find((x) => x.id === id);
  const toCard = () => router.replace(`/client/${id}`);
  const back = () => (router.canGoBack() ? router.back() : s ? toCard() : router.replace("/clients"));
  // step 17 C3: an old link to a card merged into another — say where everything went (docs/specs/04 §13)
  const kept = !c ? mergedTarget(db, id) : undefined;
  if (!c && kept && visibleClients(db, role).some((x) => x.id === kept.id))
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty
          icon="user"
          title={t("clientDup.merged")}
          hint={t("clientDup.mergedHint", { name: kept.name })}
          action={<Button label={t("clientDup.open", { name: kept.name })} onPress={() => router.replace(`/client/${kept.id}`)} />}
        />
      </Screen>
    );
  if (!c)
    return (
      <Screen title={t("clients.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  const rows = clientRowsFor(role);
  // a row's own list: the same address with ?s=<row>
  if (isClientSection(s) && rows.includes(s))
    return (
      <Screen title={t(`client.row.${s}` as DictKey)} subtitle={c.name} back={back} fab={canServe(db, c.id) ? "client" : undefined} fabCtx={{ customerId: c.id }}>
        <ClientSection c={c} s={s} />
      </Screen>
    );
  const office = role !== "tech";
  return (
    <Screen
      title={c.name}
      back={back}
      // «do not service»: no «＋» (nothing new for the client, docs/specs/04 §12; the server refuses too)
      fab={canServe(db, c.id) ? "client" : undefined}
      fabCtx={{ customerId: c.id }}
      right={office ? <Button label={t("ue.edit")} icon="pencil" variant="ghost" size="sm" onPress={() => router.push(`/client/edit?id=${c.id}`)} /> : undefined}
    >
      <ClientCardBody c={c} />
    </Screen>
  );
}
