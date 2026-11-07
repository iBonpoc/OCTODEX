/**
 * «Тип работы» and «Метки» on a job (docs/specs/17-job.md §11.1, 3b-2): rows of the details card; the office and the
 * owner change them in a sheet (choices as rows / chips, rule 12). Server: jobs.job_type_id, set_job_tags.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import type { DB, Job } from "@/data/types";
import { useI18n, type DictKey } from "@/i18n";
import { tagLabel } from "@/features/clients";
import { Button, MultiChips } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { ListRow, RowView } from "@/ui/surfaces";

export function jobTypeName(db: Pick<DB, "jobTypes">, id: string | undefined, t: (k: DictKey) => string): string | undefined {
  const jt = (db.jobTypes ?? []).find((x) => x.id === id);
  if (!jt) return undefined;
  return jt.name ?? (jt.seedKey ? t(`job3.jt.${jt.seedKey}` as DictKey) : undefined);
}

export function JobTypeTags({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const store = useStore();
  const { db } = store;
  const { t } = useI18n();
  const toast = useToast();
  const [sheet, setSheet] = useState<"type" | "tags" | null>(null);
  const [sel, setSel] = useState<string[]>(job.tagIds ?? []);
  const types = (db.jobTypes ?? []).filter((x) => !x.archivedAt || x.id === job.jobTypeId).sort((a, b) => a.position - b.position);
  const tags = db.tags.filter((x) => x.active || (job.tagIds ?? []).includes(x.id)).sort((a, b) => a.position - b.position);
  const tagNames = (job.tagIds ?? []).map((id) => db.tags.find((x) => x.id === id)).filter(Boolean).map((x) => tagLabel(x!, t));
  const queued = (msg: string) => (store.online ? msg : t("offline.queued"));
  const pickType = (id: string | null) => {
    setSheet(null);
    if ((id ?? undefined) === job.jobTypeId) return;
    toast.show(queued(t("job5.type.saved")), store.setJobType(job.id, id));
  };
  const saveTags = () => {
    setSheet(null);
    toast.show(queued(t("job5.tags.saved")), store.setJobTags(job.id, sel));
  };
  const row = (label: string, value: string, onPress?: () => void) => (
    <ListRow title={label} subtitle={value} onPress={onPress} />
  );
  return (
    <>
      {row(t("job3.type"), jobTypeName(db, job.jobTypeId, t) ?? t("job3.noType"), canEdit ? () => setSheet("type") : undefined)}
      {row(t("job5.tags"), tagNames.join(", ") || t("job5.tags.none"), canEdit ? () => { setSel(job.tagIds ?? []); setSheet("tags"); } : undefined)}
      <Sheet visible={sheet === "type"} onClose={() => setSheet(null)} title={t("job5.type.pick")}>
        <View>
          {types.map((x) => (
            <ListRow key={x.id} title={jobTypeName(db, x.id, t) ?? ""} right={x.id === job.jobTypeId ? <Icon name="check" /> : undefined} onPress={() => pickType(x.id)} />
          ))}
          <ListRow title={t("job3.noType")} right={!job.jobTypeId ? <Icon name="check" /> : undefined} onPress={() => pickType(null)} />
        </View>
      </Sheet>
      <Sheet visible={sheet === "tags"} onClose={() => setSheet(null)} title={t("job5.tags")} dirty={sel.slice().sort().join() !== (job.tagIds ?? []).slice().sort().join()} onSave={saveTags}>
        <View style={{ gap: space[3] }}>
          <MultiChips items={tags.map((x) => ({ key: x.id, label: tagLabel(x, t) }))} value={sel} onChange={setSel} />
          <RowView>
            <Button label={t("ue.save")} icon="check" full onPress={saveTags} />
          </RowView>
        </View>
      </Sheet>
    </>
  );
}
