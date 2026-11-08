/**
 * «Импорты» (docs/specs/04 §14.4, PR 3): Клиенты → «…» → «Импорты». A card per import of clients: when, the file, the
 * server's counts, its status. An open one — «Продолжить» (choose the same file again: the import goes on from the
 * first row the server has not got); an applied one — «Отменить импорт» for 30 days, after a confirmation: the cards
 * this import added and nothing was added to since are taken back, the rest stay (the answer says how many). The
 * office's only (owner, admin, office); the demo shows this phone's imports since the app was opened.
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { listImports, undoImport } from "@/cloud/importCustomers";
import { useStore } from "@/data/store";
import { demoImports, demoUndo } from "@/features/client/importDemo";
import { canImportClients, importActions, type ImportJobRow } from "@/features/client/importRun";
import { useI18n } from "@/i18n";
import { Button, StatusChip } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { CardList, Empty, Screen } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";

export default function Imports() {
  const store = useStore();
  const auth = useAuth();
  const { t, day } = useI18n();
  const toast = useToast();
  const cloud = store.mode === "cloud";
  const companyId = auth.company?.companyId ?? "";
  const [jobs, setJobs] = useState<ImportJobRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState<ImportJobRow | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/clients"));

  const load = useCallback(async () => {
    setFailed(false);
    if (!cloud) return setJobs(demoImports());
    try {
      setJobs(await listImports(companyId));
    } catch {
      setFailed(true);
      setJobs((j) => j ?? []);
    }
  }, [cloud, companyId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!canImportClients(store.role)) {
    return (
      <Screen title={t("client.imports.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }

  const undo = async () => {
    if (!asking || busy) return;
    setBusy(true);
    try {
      const r = cloud ? await undoImport(asking.id) : await demoUndo(asking.id);
      toast.show(r.kept ? t("client.import.undoneKept", { n: r.undone, k: r.kept }) : t("client.import.undone", { n: r.undone }));
      if (cloud) void store.refresh();
    } catch {
      toast.show(t("client.import.fail.undo"));
    }
    setBusy(false);
    setAsking(null);
    void load();
  };

  const now = Date.now();
  return (
    <Screen title={t("client.imports.title")} back={back}>
      <T v="body" tone="mut">
        {t("client.imports.hint")}
      </T>
      {failed ? <StatusChip status="warn" label={t("client.import.fail.network")} /> : null}
      {jobs && !jobs.length ? <Empty icon="note" title={t("client.imports.empty")} /> : null}
      {jobs?.length ? (
        <CardList>
          {jobs.map((j) => {
            const a = importActions(j, now);
            const c = j.counts;
            const status =
              j.status === "undone"
                ? { tone: "neutral" as const, label: t("client.imports.s.undone") }
                : a.open
                  ? { tone: "info" as const, label: t("client.imports.s.open") }
                  : { tone: "ok" as const, label: t("client.imports.s.applied") };
            return (
              <ListCard
                key={j.id}
                testID={`import-job-${j.id}`}
                lead={{ kind: "icon", icon: "note" }}
                title={j.fileName}
                when={[
                  day(j.createdAt),
                  t("client.imports.counts", { n: c.added ?? 0, k: c.dup_added ?? 0, m: c.skipped ?? 0 }),
                  j.status === "undone" ? t("client.imports.undoneN", { n: c.undone ?? 0, k: c.kept ?? 0 }) : null,
                ].filter(Boolean).join(" · ")}
                status={status}
                action={
                  a.canContinue
                    ? { label: t("client.import.resume"), icon: "refresh", onPress: () => router.push("/client/import") }
                    : a.canUndo && j.status !== "undone"
                      ? { label: t("client.imports.undo"), icon: "close", onPress: () => setAsking(j) }
                      : undefined
                }
              />
            );
          })}
        </CardList>
      ) : null}

      <Sheet visible={asking !== null} onClose={() => setAsking(null)} title={t("client.imports.undo")}>
        <T v="body">{t("client.imports.confirm", { file: asking?.fileName ?? "" })}</T>
        <Button label={t("client.imports.confirmYes")} icon="check" variant="danger" full disabled={busy} onPress={() => void undo()} />
        <Button label={t("common.cancel")} variant="secondary" full onPress={() => setAsking(null)} />
      </Sheet>
    </Screen>
  );
}
