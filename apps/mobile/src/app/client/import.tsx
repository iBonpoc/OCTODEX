/**
 * Import clients from CSV (docs/specs/13-app-structure.md §3.16, 15-flows §1.13, 04 §12.5): Клиенты → «…» → «Импорт из CSV».
 * File → which column is which (guessed from the headers, changeable) → where they came from → check: «Добавим N,
 * пропустим M» with every skipped row and why → «Импортировать» → the clients list, toast «Отменить» (5 s, rule 5).
 * Imported clients are `active`. Needs the network (a big batch and the duplicates check against the server's clients).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { component } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { clientStatusChip } from "@/features/clients";
import { useI18n, type DictKey } from "@/i18n";
import { SourceField } from "@/features/lead/SourcePicker";
import { guessMapping, IMPORT_FIELDS, IMPORT_MAX_BYTES, IMPORT_MAX_PARSED, IMPORT_MAX_ROWS, parseCsv, planImport, rowsOf, type ImportField, type ImportMapping, type SkipReason } from "@/features/client/csvImport";
import { Button, StatusChip } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, CardList, Divider, Empty, ItemCard, ListRow, Screen, SectionTitle } from "@/ui/surfaces";

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
/** at most this many skipped rows are listed; the count is always full */
const SKIP_SHOWN = 50;

async function readPicked(a: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    const f = (a as { file?: Blob }).file;
    return f ? f.text() : (await fetch(a.uri)).text();
  }
  return new File(a.uri).text();
}

export default function ImportClients() {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [pick, setPick] = useState<ImportField | null>(null);
  const [failed, setFailed] = useState(false);
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
  const plan = useMemo(() => planImport(store.db, rows), [store.db, rows]);

  // the office imports; the tech has no client form and the server refuses his customers insert
  if (store.role === "tech") {
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
  const canImport = !!table && hasName && hasContact && plan.add.length > 0 && store.online && !!sourceId;

  const run = () => {
    if (!canImport || busy.current) return;
    busy.current = true;
    const undos: (() => void)[] = [];
    for (const r of plan.add) {
      const x = store.addCustomer({ name: r.name, phone: r.phone, email: r.email, sourceId, address: r.address, city: r.city });
      undos.push(x.undo);
      if (r.firstName || r.lastName || r.company) undos.push(store.updateCustomer(x.id, { firstName: r.firstName, lastName: r.lastName, companyName: r.company }));
    }
    toast.show(plan.skip.length ? t("client.import.done", { n: plan.add.length, m: plan.skip.length }) : t("client.import.doneAll", { n: plan.add.length }), () => {
      for (const u of undos.reverse()) u();
    });
    router.replace("/clients");
  };

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
      {table && table.length > IMPORT_MAX_PARSED ? (
        <T v="caption" tone="mut">
          {t("client.import.truncated", { n: IMPORT_MAX_PARSED })}
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
            {t("client.import.summary", { n: plan.add.length, m: plan.skip.length })}
          </T>
          {plan.skip.length ? (
            <CardList>
              {plan.skip.slice(0, SKIP_SHOWN).map((s) => (
                <ItemCard
                  key={s.row.line}
                  status={s.reason === "dupClient" || s.reason === "dupFile" ? "neutral" : "warn"}
                  title={t("client.import.line", { n: s.row.line, name: s.row.name || "—" })}
                  subtitle={[t(SKIP_LABEL[s.reason], { who: s.who ?? "", max: IMPORT_MAX_ROWS }), s.whoStatus ? t(clientStatusChip[s.whoStatus].l) : null].filter(Boolean).join(" · ")}
                />
              ))}
              {plan.skip.length > SKIP_SHOWN ? (
                <T v="caption" tone="mut">
                  {t("client.import.more", { n: plan.skip.length - SKIP_SHOWN })}
                </T>
              ) : null}
            </CardList>
          ) : null}
          <Button label={t("client.import.run", { n: plan.add.length })} icon="check" full onPress={run} disabled={!canImport} />
          {!store.online ? <StatusChip status="warn" label={t("client.import.offline")} /> : null}
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
