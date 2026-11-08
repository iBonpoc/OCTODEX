/**
 * Import clients from CSV (docs/specs/13-app-structure.md §3.16, 15-flows §1.13, 04 §12.5): Клиенты → «…» → «Импорт из CSV».
 * File → which column is which (guessed from the headers, changeable) → where they came from → check: «Добавим N,
 * пропустим M» with every row added as a possible duplicate and every skipped row and why → «Импортировать» → the
 * server import in batches (04 §14: «Загружено N из M»; a break — «Продолжить», no duplicates) → the server's result,
 * «Скачать отчёт», toast «Отменить» (5 s, rule 5). Imported clients are `active`. Needs the network. Only the office
 * (owner, admin, office) imports — sales no more (§14.4).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { useAuth } from "@/cloud/auth";
import { cloudImportDriver, openImportFor } from "@/cloud/importCustomers";
import { demoImportDriver, demoMarkOpen, demoOpenJob } from "@/features/client/importDemo";
import { canImportClients, countsOf, reportCsv, runImport, type ImportAnswer, type ImportDriver, type ImportFailure } from "@/features/client/importRun";
import { saveText } from "@/features/client/saveText";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { clientStatusChip } from "@/features/clients";
import { useI18n, type DictKey } from "@/i18n";
import { SourceField } from "@/features/lead/SourcePicker";
import { guessMapping, IMPORT_FIELDS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv, planImport, rowsOf, type ImportField, type ImportMapping, type ImportRow, type SkipReason } from "@/features/client/csvImport";
import { Button, ProgressBar, StatusChip } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, CardList, Divider, Empty, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { ListCard } from "@/ui/listCard";

const FIELD_LABEL: Record<ImportField, DictKey> = {
  firstName: "client.import.f.firstName",
  lastName: "client.import.f.lastName",
  name: "client.import.f.name",
  company: "client.import.f.company",
  phone: "client.import.f.phone",
  email: "client.import.f.email",
  address: "client.import.f.address",
  city: "client.import.f.city",
};
const SKIP_LABEL: Record<SkipReason, DictKey> = {
  noName: "client.import.skip.noName",
  noContact: "client.import.skip.noContact",
  badPhone: "client.import.skip.badPhone",
  badEmail: "client.import.skip.badEmail",
  dupClient: "client.import.skip.dupClient",
  dupFile: "client.import.skip.dupFile",
  overLimit: "client.import.skip.overLimit",
};
const FAIL_LABEL: Record<ImportFailure, DictKey> = {
  network: "client.import.fail.network",
  not_allowed: "client.import.fail.not_allowed",
  import_busy: "client.import.fail.import_busy",
  import_daily_limit: "client.import.fail.import_daily_limit",
  import_closed: "client.import.fail.import_closed",
  row_changed: "client.import.fail.row_changed",
  import_too_big: "client.import.fail.import_too_big",
  import_undo_expired: "client.import.fail.other",
  other: "client.import.fail.other",
};
/** at most this many rows of a group are listed; the count is always full */
const SKIP_SHOWN = 50;

/** the run of one import on this screen: its job, the driver, the server's answers so far, where it stopped */
interface Run {
  jobId: string;
  /** the check at the moment of «Импортировать» */
  plan: ReturnType<typeof planImport>;
  driver: ImportDriver;
  rows: ImportRow[];
  answers: ImportAnswer[];
  total: number;
  sameFileAt?: string;
  stoppedAt?: number;
  failure?: ImportFailure;
  done: boolean;
}

async function readPicked(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    const f = (a as { file?: Blob }).file;
    return f ? f.text() : (await fetch(a.uri)).text();
  }
  return new File(a.uri).text();
}

export default function ImportClients() {
  const store = useStore();
  const auth = useAuth();
  const { t, day } = useI18n();
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [pick, setPick] = useState<ImportField | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [sending, setSending] = useState(false);
  const defaultSource = () => store.db.sources.find((x) => x.active && x.name === "Referral")?.id ?? store.db.sources.find((x) => x.active)?.id ?? "";
  const [sourceId, setSourceId] = useState(defaultSource);
  // in the cloud the sources may come after the screen opens: never leave the import without one (review #199)
  useEffect(() => {
    if (!sourceId) setSourceId(defaultSource());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.db.sources]);
  /** one import per tap: a double tap must not add everything twice (review #199) */
  const busy = useRef(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/clients"));

  const rows = useMemo(() => (table ? rowsOf(table, mapping) : []), [table, mapping]);
  const live = useMemo(() => planImport(store.db, rows), [store.db, rows]);

  // the office imports (owner, admin, office — 04 §14.4); the server refuses anyone else
  if (!canImportClients(store.role)) {
    return (
      <Screen title={t("client.import.title")} back={back}>
        <Empty icon="user" title={t("clients.empty")} />
      </Screen>
    );
  }

  const choose = async () => {
    setFailed(false);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel", "*/*"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      if ((r.assets[0].size ?? 0) > IMPORT_MAX_BYTES) {
        setFailed(true);
        return;
      }
      const parsed = parseCsv(await readPicked(r.assets[0]));
      if (parsed.length < 2) {
        setFailed(true);
        return;
      }
      setFileName(r.assets[0].name);
      setText(await readPicked(r.assets[0]));
      setRun(null);
      setTable(parsed);
      setMapping(guessMapping(parsed[0]!));
    } catch {
      setFailed(true);
    }
  };

  const header = table?.[0] ?? [];
  const sample = (i: number) => table?.slice(1).find((r) => (r[i] ?? "").trim())?.[i];
  const colLabel = (i: number | undefined) => (i === undefined ? t("client.import.notInFile") : header[i] || t("client.import.column", { n: i + 1 }));
  const hasName = mapping.name !== undefined || mapping.firstName !== undefined || mapping.lastName !== undefined || mapping.company !== undefined;
  const hasContact = mapping.phone !== undefined || mapping.email !== undefined;
  // the check as it was at «Импортировать»: the imported clients must not turn it into «пропустим всё»
  const plan = run?.plan ?? live;
  const toAdd = plan.add.length + plan.dupAdd.length;
  const canImport = !!table && hasName && hasContact && toAdd > 0 && store.online && !!sourceId && !run && !sending;
  const cloud = store.mode === "cloud";

  /** send what the server has not answered yet; a break leaves the run with «Продолжить» */
  const go = async (r: Run, from: number) => {
    setSending(true);
    const res = await runImport(r.driver, r.rows, from, r.answers, (answers) => setRun((x) => (x ? { ...x, answers: [...answers] } : x)));
    const next: Run = { ...r, answers: res.answers, done: res.done, stoppedAt: res.done ? undefined : res.stoppedAt ?? r.rows.at(-1)?.line, failure: res.failure };
    setRun(next);
    setSending(false);
    busy.current = false;
    if (!res.done) return;
    const sha = await sha256(text);
    if (!cloud) demoMarkOpen(sha, null);
    else void store.refresh();
    const c = countsOf(res.answers);
    toast.show(c.skipped ? t("client.import.done", { n: c.added + c.dupAdded, m: c.skipped }) : t("client.import.doneAll", { n: c.added + c.dupAdded }), () => {
      void r.driver.undo().then(
        (u) => {
          if (cloud) void store.refresh();
          toast.show(u.kept ? t("client.import.undoneKept", { n: u.undone, k: u.kept }) : t("client.import.undone", { n: u.undone }));
        },
        () => toast.show(t("client.import.fail.undo")),
      );
    });
  };

  const sha256 = (x: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, x);

  const start = async () => {
    if (!canImport || busy.current) return;
    busy.current = true;
    setSending(true);
    const rowsToSend = rows.slice(0, IMPORT_MAX_ROWS);
    const sha = await sha256(text);
    const companyId = auth.company?.companyId ?? "";
    // the same file left open (the screen was closed in the middle): go on with that job
    const jobId = (cloud ? await openImportFor(companyId, auth.userId ?? "", sha) : demoOpenJob(sha)) ?? Crypto.randomUUID();
    const driver = cloud
      ? cloudImportDriver({ companyId, jobId, fileName: fileName ?? "clients.csv", sha256: sha, total: rowsToSend.length, sourceId })
      : demoImportDriver({
          jobId, sha256: sha, rows: rowsToSend, db: () => store.db,
          add: (r) => {
            const x = store.addCustomer({ name: r.name, phone: r.phone, email: r.email, sourceId, address: r.address, city: r.city });
            const u2 = r.firstName || r.lastName || r.company ? store.updateCustomer(x.id, { firstName: r.firstName, lastName: r.lastName, companyName: r.company }) : null;
            return { id: x.id, undo: () => (u2?.(), x.undo()) };
          },
        });
    if (!cloud) demoMarkOpen(sha, jobId);
    let state;
    try {
      state = await driver.start();
    } catch (e) {
      const code = (e as { code?: ImportFailure }).code ?? "other";
      setRun({ jobId, plan, driver, rows: rowsToSend, answers: [], total: rowsToSend.length, failure: code, stoppedAt: 2, done: false });
      setSending(false);
      busy.current = false;
      return;
    }
    const r: Run = { jobId, plan, driver, rows: rowsToSend, answers: [], total: rowsToSend.length, sameFileAt: state.sameFileAt, done: false };
    setRun(r);
    await go(r, state.nextLine);
  };

  const resume = async () => {
    if (!run || busy.current || !store.online) return;
    busy.current = true;
    let from = run.stoppedAt ?? 2;
    if (!run.answers.length) {
      try {
        const st = await run.driver.start();
        from = st.nextLine;
      } catch (e) {
        setRun({ ...run, failure: (e as { code?: ImportFailure }).code ?? "other" });
        busy.current = false;
        return;
      }
    }
    await go({ ...run, failure: undefined }, from);
  };

  const counts = run ? countsOf(run.answers) : null;
  const report = run ? [...run.answers].filter((a) => a.result !== "added").sort((a, b) => a.line - b.line) : [];
  const nameOf = (line: number) => rows.find((r) => r.line === line)?.name || "—";
  const answerLabel = (a: ImportAnswer) =>
    a.result === "dup_added"
      ? t("client.import.dupAdd", { who: a.who ?? "" })
      : [t(SKIP_LABEL[a.reason ?? "noName"], { who: a.who ?? "", max: IMPORT_MAX_ROWS }), a.who_status ? t(clientStatusChip[a.who_status].l) : null].filter(Boolean).join(" · ");

  return (
    <Screen title={t("client.import.title")} back={back}>
      <T v="body" tone="mut">
        {t("client.import.hint", { max: IMPORT_MAX_ROWS })}
      </T>
      <Button label={fileName ? t("client.import.otherFile") : t("client.import.chooseFile")} icon="note" variant={fileName ? "secondary" : "primary"} full onPress={choose} />
      {fileName ? (
        <T v="caption" tone="mut">
          {t("client.import.file", { name: fileName, n: Math.max(0, (table?.length ?? 1) - 1) })}
        </T>
      ) : null}
      {failed ? <StatusChip status="bad" label={t("client.import.unreadable")} /> : null}
      {table && table.length - 1 > IMPORT_MAX_ROWS ? (
        <T v="caption" tone="mut">
          {t("client.import.truncated", { n: IMPORT_MAX_ROWS })}
        </T>
      ) : null}

      {table ? (
        <>
          <SectionTitle title={t("client.import.columns")} />
          <Card>{/* ds-allow: the fields of ONE import (which column is which), not a list of objects */}
            {IMPORT_FIELDS.map((f, i) => (
              <View key={f}>
                {i > 0 ? <Divider /> : null}
                <ListRow title={t(FIELD_LABEL[f])} subtitle={colLabel(mapping[f])} onPress={() => setPick(f)} />
              </View>
            ))}
          </Card>
          {!hasName ? <StatusChip status="warn" label={t("client.import.needName")} /> : null}
          {!hasContact ? <StatusChip status="warn" label={t("client.import.needContact")} /> : null}
          <SourceField value={sourceId} onChange={setSourceId} label={t("client.import.source")} />

          <SectionTitle title={t("client.import.check")} />
          <T v="heading" tabular>
            {plan.dupAdd.length
              ? t("client.import.summaryDup", { n: toAdd, k: plan.dupAdd.length, m: plan.skip.length })
              : t("client.import.summary", { n: toAdd, m: plan.skip.length })}
          </T>
          {plan.dupAdd.length && !run ? (
            <CardList>
              {plan.dupAdd.slice(0, SKIP_SHOWN).map((d) => (
                // added, but a weak sign (the same address): the card will carry «Возможный дубль» (04 §13, S3d)
                <ListCard
                  key={d.row.line}
                  density="compact"
                  lead={{ kind: "icon", icon: "users", tone: "warn" }}
                  title={t("client.import.line", { n: d.row.line, name: d.row.name || "—" })}
                  when={t("client.import.dupAdd", { who: d.who })}
                />
              ))}
            </CardList>
          ) : null}
          {plan.skip.length && !run ? (
            <CardList>
              {plan.skip.slice(0, SKIP_SHOWN).map((s) => (
                // a duplicate is skipped on purpose (grey); a broken row needs a look (warn edge)
                <ListCard
                  key={s.row.line}
                  density="compact"
                  lead={s.reason === "dupClient" || s.reason === "dupFile" ? { kind: "icon", icon: "users" } : { kind: "icon", icon: "alert", tone: "warn" }}
                  edge={s.reason === "dupClient" || s.reason === "dupFile" ? null : "warn"}
                  title={t("client.import.line", { n: s.row.line, name: s.row.name || "—" })}
                  when={[t(SKIP_LABEL[s.reason], { who: s.who ?? "", max: IMPORT_MAX_ROWS }), s.whoStatus ? t(clientStatusChip[s.whoStatus].l) : null].filter(Boolean).join(" · ")}
                />
              ))}
              {plan.skip.length > SKIP_SHOWN ? (
                <T v="caption" tone="mut">
                  {t("client.import.more", { n: plan.skip.length - SKIP_SHOWN })}
                </T>
              ) : null}
            </CardList>
          ) : null}
          {!run ? <Button label={t("client.import.run", { n: toAdd })} icon="check" full onPress={start} disabled={!canImport} /> : null}
          {!store.online ? <StatusChip status="warn" label={t("client.import.offline")} /> : null}

          {run ? (
            <View testID="import-run" style={{ gap: space[2] }}>
              <SectionTitle title={t("client.import.sending")} />
              {run.sameFileAt ? <StatusChip status="info" label={t("client.import.sameFile", { date: day(run.sameFileAt) })} /> : null}
              <ProgressBar value={run.answers.length} max={run.total} label={t("client.import.progress", { n: run.answers.length, total: run.total })} />
              {!run.done && !sending && run.failure ? (
                <>
                  <StatusChip status="bad" label={[t("client.import.stopped", { n: run.stoppedAt ?? 2 }), t(FAIL_LABEL[run.failure])].join(" · ")} />
                  {run.failure === "network" || run.failure === "other" ? (
                    <Button label={t("client.import.resume")} icon="refresh" full onPress={() => void resume()} disabled={!store.online} />
                  ) : null}
                </>
              ) : null}
              {run.done && counts ? (
                <>
                  <View testID="import-result">
                    <T v="heading" tabular>
                      {t("client.import.result", { n: counts.added, k: counts.dupAdded, m: counts.skipped })}
                    </T>
                  </View>
                  {report.length ? (
                    <CardList>
                      {report.slice(0, SKIP_SHOWN).map((a) => (
                        <ListCard
                          key={a.line}
                          density="compact"
                          lead={a.result === "dup_added" || a.reason === "dupClient" || a.reason === "dupFile" ? { kind: "icon", icon: "users", tone: a.result === "dup_added" ? "warn" : undefined } : { kind: "icon", icon: "alert", tone: "warn" }}
                          edge={a.result === "skipped" && a.reason !== "dupClient" && a.reason !== "dupFile" ? "warn" : null}
                          title={t("client.import.line", { n: a.line, name: nameOf(a.line) })}
                          when={answerLabel(a)}
                        />
                      ))}
                      {report.length > SKIP_SHOWN ? (
                        <T v="caption" tone="mut">
                          {t("client.import.moreReport", { n: report.length - SKIP_SHOWN })}
                        </T>
                      ) : null}
                    </CardList>
                  ) : null}
                  <Button label={t("client.import.report")} icon="note" variant="secondary" full onPress={() => void saveText(`import-report-${(fileName ?? "clients").replace(/\.csv$/i, "")}.csv`, reportCsv(run.answers, run.rows))} />
                  <Button label={t("client.import.toClients")} icon="users" full onPress={() => router.replace("/clients")} />
                </>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <Sheet visible={pick !== null} onClose={() => setPick(null)} title={pick ? t(FIELD_LABEL[pick]) : ""}>
        <ScrollView style={{ maxHeight: component.sheetListMax }} keyboardShouldPersistTaps="handled">
          <ListRow title={t("client.import.notInFile")} onPress={() => { if (pick) setMapping((m) => ({ ...m, [pick]: undefined })); setPick(null); }} />
          {header.map((h, i) => (
            <View key={i}>
              <Divider />
              <ListRow
                title={h || t("client.import.column", { n: i + 1 })}
                subtitle={sample(i)}
                right={pick && mapping[pick] === i ? <StatusChip status="ok" label={t("client.import.chosen")} /> : undefined}
                onPress={() => {
                  if (pick) setMapping((m) => {
                    // a column goes to one field: taking it here frees it elsewhere
                    const next: ImportMapping = { ...m };
                    for (const f of IMPORT_FIELDS) if (next[f] === i) next[f] = undefined;
                    next[pick] = i;
                    return next;
                  });
                  setPick(null);
                }}
              />
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
