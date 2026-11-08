/**
 * «Шаблоны смет» (docs/specs/07 §7.4, §11, E3b): the company's estimate templates as cards. Everyone uses them
 * («Новая смета» from a card); the director and the office rename and archive them (archive instead of delete, «Отменить»
 * 5 s, rule 5), copy them and edit their lines in the builder (/estimate/new?editTemplate=, §12 №10, №11). A template
 * is made from an estimate («Сохранить как шаблон») or added from a module's starters («Шаблоны модулей», §12, E3c).
 */
import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import type { EstimateTemplate } from "@/data/types";
import {
  canEditEstimateTemplates, copyTemplate, ESTIMATE_TEMPLATE_NAME_MAX, estimateStartersToAdd, pickableTemplates, starterEstimateId, starterEstimateTemplate,
  fromTemplate, templateFromCents,
} from "@/features/estimateTemplate";
import { tFor } from "@/i18n/translate";
import { activeModules, moduleDef, type StarterEstimate } from "@/modules/registry";
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
  const seeCosts = store.db.costsVisible ?? store.role !== "tech";
  // the module's name, not its key (a module the app no longer has — its key as is)
  const moduleName = (key: string) => {
    const d = moduleDef(key);
    return d ? t(d.titleKey) : key;
  };

  // starters of the company's active modules not added yet (§12): one tap, then they are the company's own
  const modules = activeModules(store.db.company);
  const companyId = store.db.company?.id ?? "demo";
  const starters = edit && !store.db.estimateTemplatesMissing ? estimateStartersToAdd(modules, all, companyId) : [];
  // a second tap before the card goes (it would land on the next card): once per screen, «Отменить» frees it
  const pressed = useRef(new Set<string>());
  const addStarter = (module: string, starter: StarterEstimate) => {
    const id = starterEstimateId(companyId, module, starter.key);
    if (pressed.current.has(id)) return;
    const tpl = starterEstimateTemplate(module, starter, {
      id, catalog: store.db.catalog, tApp: t, tDoc: tFor(store.db.company?.docLanguage ?? "en"),
      depositBps: store.db.company?.estimate.depositBps, costsVisible: seeCosts,
    });
    if (!tpl) return;
    pressed.current.add(id);
    const undo = store.saveEstimateTemplate(tpl, { ifNew: true });
    // lines the catalog lacked: price 0 — said at once (and «проверьте цену» in the builder)
    const unpriced = fromTemplate(tpl.doc, store.db.catalog, {}, false, true).checkPrice;
    const msg = unpriced.length ? t("est.tpl.starterNoPrice", { n: unpriced.length }) : t("est.tpl.starterAdded", { name: tpl.name });
    toast.show(store.online ? msg : t("offline.queued"), () => {
      pressed.current.delete(id);
      undo();
    });
  };
  const copy = (x: EstimateTemplate) => {
    const c = copyTemplate(x, t("est.tpl.copyName", { name: x.name }), seeCosts);
    if (!c) return;
    save(c, t("est.tpl.copied", { name: c.name }));
  };

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
        status={x.archivedAt ? { tone: "neutral", label: t("est.tpl.archived") } : x.module ? { tone: "info", label: t("est.tpl.module", { m: moduleName(x.module) }) } : undefined}
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
      {starters.length ? (
        <View testID="est-starters" style={{ gap: space[3] }}>
          <T v="heading">{t("est.tpl.starters")}</T>
          <T v="caption" tone="mut">{t("est.tpl.startersHint")}</T>
          <CardGrid>
            {starters.map(({ module, starter }) => (
              <View key={`${module}-${starter.key}`} testID={`est-starter-${module}-${starter.key}`}>
                <ListCard
                  density="compact"
                  lead={{ kind: "icon", icon: "copy" }}
                  title={t(starter.nameKey)}
                  when={`${t("est.tpl.options", { n: starter.options.length })} · ${moduleName(module)}`}
                  action={{ label: t("check.add"), icon: "plus", onPress: () => addStarter(module, starter) }}
                />
              </View>
            ))}
          </CardGrid>
        </View>
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
                {!open.archivedAt ? (
                  <>
                    <View testID="est-tpl-edit">
                      <Button label={t("est.tpl.editLines")} icon="pencil" variant="secondary" full onPress={() => { setOpen(null); router.push(`/estimate/new?editTemplate=${open.id}`); }} />
                    </View>
                    <View testID="est-tpl-copy">
                      <Button label={t("est.tpl.copy")} icon="copy" variant="secondary" full onPress={() => copy(open)} />
                    </View>
                  </>
                ) : null}
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
