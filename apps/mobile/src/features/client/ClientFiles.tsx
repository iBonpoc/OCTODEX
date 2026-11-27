/**
 * #3076 «Фото и файлы» клиента: every photo of the client's visits as a grid, grouped by visit (the newest first, as the moments
 * of iOS «Фото»), and the client's other files as rows under them. A group's title is the day; its first row — the job, the time
 * and the tech, «›» — opens the visit, the grid is under it. A photo opens the same viewer as the visit's strip (PhotoStrip, read-only here: photos are added and deleted in the
 * visit). The filter — «Объект» and «Работа» fields (DS А2) — shows only when there is more than one to choose from.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import type { Customer, FileKind } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { PhotoStrip } from "@/features/PhotoStrip";
import { visitWhen } from "@/features/schedule";
import { useClientFacts } from "@/features/client/ClientSections";
import { clientMediaOf, filterMedia, mediaChoices } from "@/features/client/clientMedia";
import { GroupedList, GroupRow, ListGroup } from "@/ui/groupedList";
import { SelectField } from "@/ui/selectField";
import { Empty } from "@/ui/surfaces";
import { memberName } from "@/features/team";
import type { IconKey } from "@/ui/primitives";

const ALL = "_all";
const KIND_ICON: Record<FileKind, IconKey> = { photo: "image", receipt: "receipt", signature: "signature", drawing: "ruler", document: "doc" };

export function ClientFiles({ c }: { c: Customer }) {
  const f = useClientFacts(c);
  const { db, r, visits } = f;
  const { t, day, time } = useI18n();
  const [propertyId, setProperty] = useState<string | null>(null);
  const [jobId, setJob] = useState<string | null>(null);
  const all = useMemo(() => clientMediaOf(db, visits, c.id, new Set(r.jobs.map((j) => j.id))), [db, visits, c.id, r.jobs]);
  const jobOf = (id?: string) => (id ? db.jobs.find((j) => j.id === id) : undefined);
  const shown = filterMedia(all, { propertyId, jobId }, (fi) => jobOf(fi.jobId));
  const choices = mediaChoices(all, r.properties, r.jobs, propertyId);

  if (!all.total) return <Empty icon="image" title={t("c3076.empty")} hint={t("c3076.emptyHint")} testID="client-files-empty" />;

  return (
    <GroupedList testID="client-files">
      {choices.properties.length > 1 || choices.jobs.length > 1 ? (
        <ListGroup>
          {choices.properties.length > 1 ? (
            <SelectField<string>
              testID="client-files-property"
              label={t("c3076.property")}
              value={propertyId ?? ALL}
              items={[{ key: ALL, label: t("c3076.allProperties"), top: true }, ...choices.properties.map((p) => ({ key: p.id, label: p.address, subtitle: p.city }))]}
              onChange={(k) => {
                setProperty(k === ALL ? null : k);
                setJob(null);
              }}
            />
          ) : null}
          {choices.jobs.length > 1 ? (
            <SelectField<string>
              testID="client-files-job"
              label={t("c3076.job")}
              value={jobId ?? ALL}
              items={[{ key: ALL, label: t("c3076.allJobs"), top: true }, ...choices.jobs.map((j) => ({ key: j.id, label: j.title }))]}
              onChange={(k) => setJob(k === ALL ? null : k)}
            />
          ) : null}
        </ListGroup>
      ) : null}
      {!shown.total ? <Empty icon="image" title={t("c3076.emptyFilter")} testID="client-files-none" /> : null}
      {shown.groups.map((g) => (
        <ListGroup key={g.visit.id} testID={`client-files-visit-${g.visit.id}`} title={day(g.visit.start)}>
          <GroupRow
            compact
            wrap
            testID={`client-files-open-${g.visit.id}`}
            lead={{ icon: "calendar" }}
            title={g.job?.title ?? t("c3076.visit")}
            subtitle={[visitWhen(g.visit, time, t("plan5.allDay"), false), memberName(db, g.visit.techId, t)].filter(Boolean).join(" · ")}
            chevron
            onPress={() => router.push(`/visit/${g.visit.id}`)}
          />
          <View style={{ padding: space[3] }}>
            <PhotoStrip grid photos={g.photos} caption={[g.job?.title, day(g.visit.start), memberName(db, g.visit.techId, t)].filter(Boolean).join(" · ")} />
          </View>
        </ListGroup>
      ))}
      {shown.files.length ? (
        <ListGroup title={t("c3076.files")} count={shown.files.length} testID="client-files-files">
          {shown.files.map((fi) => {
            const j = jobOf(fi.jobId);
            const href = fi.visitId ? `/visit/${fi.visitId}` : fi.jobId ? `/job/${fi.jobId}` : null;
            return (
              <GroupRow
                key={fi.id}
                testID={`client-file-${fi.id}`}
                lead={{ icon: KIND_ICON[fi.kind] }}
                title={t(`c3076.k.${fi.kind}` as DictKey)}
                subtitle={[day(fi.at), j?.title].filter(Boolean).join(" · ")}
                chevron={!!href}
                onPress={href ? () => router.push(href as never) : undefined}
              />
            );
          })}
        </ListGroup>
      ) : null}
    </GroupedList>
  );
}
