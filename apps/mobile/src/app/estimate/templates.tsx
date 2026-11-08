/**
 * «Шаблоны смет» (docs/specs/07 §7.4, §11, E3b): the company's estimate templates as cards. Everyone uses them
 * («Новая смета» from a card); the director and the office rename and archive them (archive instead of delete, «Отменить»
 * 5 s, rule 5). A template is made from an estimate («…» → «Сохранить как шаблон»), not here.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { EstimateTemplate } from "@/data/types";
import { canEditEstimateTemplates, ESTIMATE_TEMPLATE_NAME_MAX, pickableTemplates, templateFromCents } from "@/features/estimateTemplate";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Sheet, useToast } from "@/ui/overlays";
import { Empty, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";

export default function EstimateTemplates() {
  const store = useStore();
  const { t, money } = useI18n();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<EstimateTemplate | null>(null);
  const [name, setName] = useState("");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/estimates"));
  const all = store.db.estimateTemplates ?? [];
  const live = pickableTemplates(all);
  const archived = all.filter((x) => x.archivedAt);
  const edit = canEditEstimateTemplates(store.role);

  const save = (x: EstimateTemplate, msg: string) => {
    const undo = store.saveEstimateTemplate(x);
    toast.show(store.online ? msg : t("offline.queued"), undo);
    setOpen(null);
  };
  const card = (x: EstimateTemplate) => (
    <View key={x.id} testID={`est-tpl-${x.id}`}>
      <ListCard
        density="regular"
        lead={{ kind: "icon", icon: "copy" }}
        title={x.name}
        when={`${t("est.tpl.options", { n: x.doc.options.length })} · ${t("est.tpl.used", { n: x.uses ?? 0 })}`}
        value={t("est.tpl.from", { sum: money(templateFromCents(x.doc, store.db.catalog)) })}
        status={x.archivedAt ? { tone: "neutral", label: t("est.tpl.archived") } : x.module ? { tone: "info", label: t("est.tpl.module", { m: x.module }) } : undefined}
        action={x.archivedAt ? undefined : { label: t("est.tpl.use"), icon: "plus", onPress: () => router.push(`/estimate/new?template=${x.id}`) }}
        onPress={() => {
          setName(x.name);
          setOpen(x);
        }}
      />
    </View>
  );

  return (
    <Screen title={t("est.tpl.title")} back={back} subtitle={t("est.tpl.who")}>
      {live.length === 0 ? (
        <Empty icon="copy" title={t("est.tpl.empty")} hint={t("est.tpl.emptyHint")} />
      ) : (
        <CardGrid>{live.map(card)}</CardGrid>
      )}
      {archived.length ? (
        showArchived ? (
          <CardGrid>{archived.map(card)}</CardGrid>
        ) : (
          <Button label={t("est.tpl.showArchived", { n: archived.length })} variant="ghost" onPress={() => setShowArchived(true)} />
        )
      ) : null}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open ? (
          <View testID="est-tpl-sheet" style={{ gap: space[3] }}>
            {!open.archivedAt ? (
              <View testID="est-tpl-use">
                <Button label={t("est.tpl.use")} icon="plus" full onPress={() => { setOpen(null); router.push(`/estimate/new?template=${open.id}`); }} />
              </View>
            ) : null}
            {edit ? (
              <>
                <T v="caption" tone="mut">{t("est.tpl.name")}</T>
                <View testID="est-tpl-name">
                  <TextField type="text" label={t("est.tpl.name")} value={name} onChangeText={(v) => setName(v.slice(0, ESTIMATE_TEMPLATE_NAME_MAX))} />
                </View>
                <View testID="est-tpl-rename">
                  <Button label={t("est.tpl.rename")} variant="secondary" full disabled={!name.trim() || name.trim() === open.name} onPress={() => save({ ...open, name }, t("est.tpl.saved", { name: name.trim() }))} />
                </View>
                <View testID="est-tpl-archive">
                  {open.archivedAt ? (
                    <Button label={t("est.tpl.restore")} icon="undo" variant="secondary" full onPress={() => save({ ...open, archivedAt: undefined }, t("est.tpl.restoredToast"))} />
                  ) : (
                    <Button label={t("est.tpl.archive")} icon="trash" variant="ghost" full onPress={() => save({ ...open, archivedAt: new Date().toISOString() }, t("est.tpl.archivedToast"))} />
                  )}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
