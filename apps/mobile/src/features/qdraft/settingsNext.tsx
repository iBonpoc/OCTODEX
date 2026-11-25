// ЧЕРНОВИК (#2549 / #2552, #2546; не для влития): «Настройки приложения» по ДС §12.3 — группы строк вместо карточек на
// каждую настройку. Включается `?qv=a` на /settings; `?qv=a&store=1` — магазинная сборка (без строки «Дизайн-система», #2546).
// Только компоненты src/ui; что им не хватало — пропы с пометкой «ЧЕРНОВИК» (ToggleRow inGroup, SelectField row, GroupRow action).
import { Linking, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { languages, useI18n, type Lang } from "@/i18n";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { useConfirm } from "@/ui/confirmDialog";
import { ListGroup, GroupRow } from "@/ui/groupedList";
import { SelectField } from "@/ui/selectField";
import { ToggleRow } from "@/ui/toggleRow";
import { BrandLogo } from "@/ui/brand";
import { Screen } from "@/ui/surfaces";
import { canSeeShowcase } from "@/features/showcase/access";
import { useHapticsEnabled } from "@/ui/haptics";
import { usePlanShowDone } from "@/features/prefs";
import { pushGroupOn, pushGroupsFor } from "@/features/pushPrefs";
import { editionLabel, LEGAL_VERSIONS, legalHref } from "@/features/legal";
import { BUILD } from "@/config/version";
import { qflag } from "./qv";

export function SettingsNext() {
  const { t, lang, setLang } = useI18n();
  const { db, online, setOnline, resetDemo, mode, role, availableRoles, setPushKind } = useStore();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const hints = useHints();
  const [dialog, ask] = useConfirm();
  const [showDone, setShowDone] = usePlanShowDone();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  const store = qflag("store") === "1";
  const me = db.members.find((m) => m.id === db.me);
  const groups = pushGroupsFor(mode === "cloud" ? availableRoles : [role], me?.kind === "sub");
  const reset = async () => {
    const k = await ask({
      title: "Сбросить тестовые данные?",
      text: "Клиенты, сметы и оплаты демо вернутся к началу. Ваши правки в демо пропадут.",
      actions: [
        { key: "no", label: "Не сбрасывать", tone: "cancel" },
        { key: "yes", label: "Сбросить", tone: "danger" },
      ],
    });
    if (k === "yes") toast.show(t("more.resetDone"), resetDemo());
  };
  return (
    <Screen title={t("nav.mySettings")}>
      <ListGroup title={t("settings.look")} inset={space[4]}>
        <SelectField<ThemePref>
          row
          label={t("more.theme")}
          value={pref}
          onChange={setPref}
          items={[
            { key: "system", label: t("more.themeSystem") },
            { key: "dark", label: t("more.dark") },
            { key: "light", label: t("more.light") },
          ]}
        />
        <SelectField<Lang> row label={t("more.language")} value={lang} onChange={setLang} items={languages.map((l) => ({ key: l.id, label: l.label }))} />
        <ToggleRow inGroup label={t("haptics.title")} caption="Лёгкий отклик при сохранении и отметках" value={hapticsOn} onChange={setHapticsOn} />
        {!store && canSeeShowcase(mode, role) ? (
          <GroupRow title={t("ds.title")} subtitle="Только в TestFlight и демо · живые образцы" chevron onPress={() => router.push("/settings/design-system")} testID="settings-design-system" />
        ) : null}
      </ListGroup>

      <ListGroup title={t("pref7b.plan")} inset={space[4]}>
        <ToggleRow inGroup label={t("plan5.showDone")} caption="Выполненные выезды, работы и задачи" value={showDone} onChange={setShowDone} />
      </ListGroup>

      <ListGroup title={t("settings.hints")} inset={space[4]}>
        <GroupRow
          title={t("more.showHints")}
          subtitle={t("settings.hintsText")}
          action="acc"
          onPress={() => {
            hints.reset();
            toast.show("Подсказки включены");
          }}
        />
      </ListGroup>

      <ListGroup title={t("push.title")} inset={space[4]}>
        <GroupRow wrap title="Разрешить в настройках телефона" subtitle="Сейчас уведомления запрещены" chevron onPress={() => void Linking.openSettings().catch(() => undefined)} />
      </ListGroup>
      <ListGroup title={t("push.kinds.title")} inset={space[4]}>
        {groups.map((g) => (
          <ToggleRow key={g} inGroup label={t(`push.kind.${g}`)} caption={t(`push.kind.${g}.hint`)} value={pushGroupOn(db.pushPrefs, g)} onChange={(v) => setPushKind(g, v)} />
        ))}
      </ListGroup>

      <ListGroup title={t("settings.about")} inset={space[4]}>
        <View style={{ alignItems: "center", gap: space[2], paddingVertical: space[4] }}>
          <BrandLogo width={component.brand.about} />
          <T v="caption" tone="mut" tabular>
            {t("brand.about.version", { v: Constants.expoConfig?.version ?? "1.0.0", b: BUILD || "dev" })}
          </T>
        </View>
        <GroupRow title={t("legal.terms.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.terms) })} chevron onPress={() => router.push(legalHref("terms"))} />
        <GroupRow title={t("legal.privacy.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.privacy) })} chevron onPress={() => router.push(legalHref("privacy"))} />
        <GroupRow title={t("support.title")} subtitle={t("support.subtitle")} chevron onPress={() => router.push("/help")} />
      </ListGroup>

      {mode === "demo" ? (
        <ListGroup title={t("settings.testing")} inset={space[4]}>
          <ToggleRow
            inGroup
            label={t("offline.toggle")}
            caption={t("settings.testingHint")}
            value={!online}
            onChange={(off) => {
              const sent = setOnline(!off);
              if (!off) toast.show(t("offline.synced", { n: sent }));
            }}
          />
          <GroupRow title={t("more.resetDemo")} action="bad" onPress={() => void reset()} testID="settings-reset" />
        </ListGroup>
      ) : null}
      {dialog}
    </Screen>
  );
}
