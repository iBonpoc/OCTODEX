/**
 * «Ещё → Компания → Чек-листы» (docs/specs/08 §6, §7.1, CH2): the company's templates as cards and the photo rules of
 * a visit. Templates — the director and the office (founder В2 05.11); photo rules — the director only (§11.5 №30);
 * sales and a tech do not come here (nav/roles.ts: the company section). A template comes into a visit as a snapshot
 * when the visit is made (S4, S9) — editing it here changes only new visits.
 */
import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { ChecklistTemplate } from "@/data/types";
import { canEditTemplates, canEditVisitSettings, starterTemplate, starterTemplateId, startersToAdd, visitSettings } from "@/features/checklist";
import { activeModules, moduleDef } from "@/modules/registry";
import { Button, ReadOnly, StatusChip, Stepper, Toggle } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { Card, Empty, RowView, Screen } from "@/ui/surfaces";
import { CardGrid, ListCard } from "@/ui/listCard";
import { withAfter } from "@/data/undo";

export default function CompanyChecklists() {
  const store = useStore();
  const { t } = useI18n();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/company"));
  const all = store.db.checklistTemplates ?? [];
  // the module's name, not its key (a module the app no longer has — its key as is)
  const moduleName = (key: string) => {
    const d = moduleDef(key);
    return d ? t(d.titleKey) : key;
  };
  const live = all.filter((x) => !x.archivedAt);
  const archived = all.filter((x) => x.archivedAt);
  const edit = canEditTemplates(store.role);
  const s = visitSettings(store.db);
  const photosRo = !canEditVisitSettings(store.role);
  const setPhotos = (patch: Parameters<typeof store.setVisitSettings>[0]) => {
    const undo = store.setVisitSettings(patch);
    toast.show(store.online ? t("co.saved") : t("offline.queued"), undo);
  };
  const catalogName = (id: string) => store.db.catalog.find((c) => c.id === id)?.name;
  const when = (x: ChecklistTemplate): string => {
    const parts: string[] = [];
    if (x.appliesTo.everyVisit) parts.push(t("chk2.every"));
    if (x.appliesTo.visitKinds.includes("inspection")) parts.push(t("chk2.kindInspection"));
    if (x.appliesTo.visitKinds.includes("work")) parts.push(t("chk2.kindWork"));
    const names = x.appliesTo.catalogItemIds.map(catalogName).filter((n): n is string => !!n);
    if (names.length) parts.push(t("chk2.services", { list: names.length > 1 ? t("chk2.servicesMore", { first: names[0]!, n: names.length - 1 }) : names[0]! }));
    return parts.length ? parts.join(" · ") : t("chk2.never");
  };
  const card = (x: ChecklistTemplate) => (
    <View key={x.id} testID={`chk-tpl-${x.id}`}>
      <ListCard
        density="compact"
        lead={{ kind: "icon", icon: "checklist" }}
        title={x.name}
        when={`${t("chk2.items", { n: x.items.length, m: x.items.filter((i) => i.required).length })} · ${when(x)}`}
        status={x.archivedAt ? { tone: "neutral", label: t("chk2.archived") } : x.module ? { tone: "info", label: t("chk2.module", { m: moduleName(x.module) }) } : undefined}
        onPress={() => router.push(`/company/checklist/${x.id}`)}
      />
    </View>
  );

  // starter templates of the company's active modules not added yet (§11.11): one tap, then they are the company's own
  const modules = activeModules(store.db.company);
  const companyId = store.db.company?.id ?? "demo";
  const starters = edit && !store.db.checklistLegacy ? startersToAdd(modules, all, companyId) : [];
  // a second tap before the card goes (it would land on the next card): once per screen, «Отменить» frees it
  const pressed = useRef(new Set<string>());
  const addStarter = (module: string, starter: (typeof starters)[number]["starter"]) => {
    const id = starterTemplateId(companyId, module, starter.key);
    if (pressed.current.has(id)) return;
    const tpl = starterTemplate(module, starter, t, id);
    if (!tpl) return;
    pressed.current.add(id);
    const undo = store.saveChecklistTemplate(tpl, { ifNew: true });
    // too late (false): the template stays, and so does «pressed» (#1244)
    toast.show(store.online ? t("chk3.starterAdded") : t("offline.queued"), withAfter(undo, () => pressed.current.delete(id)));
  };

  return (
    <Screen title={t("chk2.title")} back={back} subtitle={t("chk2.who")}>
      {edit ? (
        <View testID="chk-tpl-new">
          <Button label={t("chk2.new")} icon="plus" full onPress={() => router.push("/company/checklist/new")} />
        </View>
      ) : null}
      {live.length === 0 ? (
        <Empty icon="checklist" title={t("chk2.empty")} />
      ) : (
        <CardGrid>{live.map(card)}</CardGrid>
      )}
      {starters.length ? (
        <>
          <T v="heading">{t("chk3.starters")}</T>
          <CardGrid>
            {starters.map(({ module, starter }) => {
              const def = modules.find((m) => m.key === module);
              return (
                <View key={`${module}-${starter.key}`} testID={`chk-starter-${module}-${starter.key}`}>
                  <ListCard
                    density="compact"
                    lead={{ kind: "icon", icon: "checklist" }}
                    title={t(starter.nameKey)}
                    when={`${t("chk2.items", { n: starter.items.length, m: starter.items.filter((i) => i.required).length })} · ${def ? t(def.titleKey) : module}`}
                    action={{ label: t("check.add"), icon: "plus", onPress: () => addStarter(module, starter) }}
                  />
                </View>
              );
            })}
          </CardGrid>
        </>
      ) : null}
      {archived.length ? (
        showArchived ? (
          <CardGrid>{archived.map(card)}</CardGrid>
        ) : (
          <Button label={t("chk2.showArchived", { n: archived.length })} variant="ghost" onPress={() => setShowArchived(true)} />
        )
      ) : null}

      <View testID="chk-photo-rules">
        <Card>
          <T v="heading">{t("chk2.photos")}</T>
          <T v="caption" tone="mut">{t("chk2.photosHint")}</T>
          {photosRo ? <StatusChip status="info" label={t("fix.co.readOnly")} soft /> : null}
          <ReadOnly value={photosRo}>
            <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
              <T v="body" style={{ flex: 1 }}>{t("chk2.before")}</T>
              <Toggle label={t("chk2.before")} on={s.photosBeforeRequired} onChange={(on) => setPhotos({ photosBeforeRequired: on })} />
            </RowView>
            {s.photosBeforeRequired ? (
              <Stepper label={`${t("chk2.minBefore")} · ${t("chk2.minimum")}`} value={s.minPhotosBefore} min={1} max={20} onChange={(v) => setPhotos({ minPhotosBefore: v })} />
            ) : null}
            <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
              <T v="body" style={{ flex: 1 }}>{t("chk2.after")}</T>
              <Toggle label={t("chk2.after")} on={s.photosAfterRequired} onChange={(on) => setPhotos({ photosAfterRequired: on })} />
            </RowView>
            {s.photosAfterRequired ? (
              <Stepper label={`${t("chk2.minAfter")} · ${t("chk2.minimum")}`} value={s.minPhotosAfter} min={1} max={20} onChange={(v) => setPhotos({ minPhotosAfter: v })} />
            ) : null}
          </ReadOnly>
        </Card>
      </View>
    </Screen>
  );
}
