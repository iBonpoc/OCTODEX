// ЧЕРНОВИК (#2549 / #2552, #2546; не для влития): «Настройки приложения» по ДС §12.3 — группы строк вместо карточек на
// каждую настройку. Включается `?qv=a` на /settings; `?qv=a&store=1` — вид магазинной сборки (#2546: без «Дизайн-системы»,
// без «Для проверки» и метки «Демо»). Тексты — прежние ключи i18n; только компоненты src/ui; чего им не хватало — пропы
// с пометкой «ЧЕРНОВИК» (ToggleRow inGroup, SelectField row, ActionRow inGroup, ListGroup note, LocationSetting/UpdateRow row).
import { Linking, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { component, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { languages, useI18n, type Lang } from "@/i18n";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Platform } from "react-native";
import { T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { useConfirm } from "@/ui/confirmDialog";
import { ListGroup, GroupRow } from "@/ui/groupedList";
import { SelectField } from "@/ui/selectField";
import { ToggleRow } from "@/ui/toggleRow";
import { ActionRow } from "@/ui/multiValueField";
import { BrandLogo } from "@/ui/brand";
import { Screen } from "@/ui/surfaces";
import { canSeeShowcase } from "@/features/showcase/access";
import { useHapticsEnabled } from "@/ui/haptics";
import { usePlanShowDone } from "@/features/prefs";
import { pushGroupOn, pushGroupsFor } from "@/features/pushPrefs";
import { usePushState } from "@/features/PushSettings";
import { LocationSetting } from "@/features/LocationParts";
import { UpdateRow } from "@/features/UpdateRow";
import { updatesSupported } from "@/features/appUpdate";
import { editionLabel, LEGAL_VERSIONS, legalHref } from "@/features/legal";
import { VersionLine } from "@/features/version";
import { BUILD } from "@/config/version";
import { qflag } from "./qv";

const STATE_TEXT = { on: "push.state.on", off: "push.state.off", denied: "push.state.denied", signed_out: "push.state.signed_out", web: "push.state.web", expo_go: "push.state.expo_go" } as const;

export function SettingsNext() {
  const { t, lang, setLang } = useI18n();
  const { db, online, setOnline, resetDemo, mode: realMode, role, availableRoles, setPushKind } = useStore();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const hints = useHints();
  const [dialog, ask] = useConfirm();
  const [showDone, setShowDone] = usePlanShowDone();
  const [hapticsOn, setHapticsOn] = useHapticsEnabled();
  const push = usePushState();
  const store = qflag("store") === "1";
  // the store build: a real company, not the demo (the showcase and «Для проверки» are the demo's / TestFlight's)
  const mode = store ? "cloud" : realMode;
  const me = db.members.find((m) => m.id === db.me);
  const groups = pushGroupsFor(realMode === "cloud" ? availableRoles : [role], me?.kind === "sub");
  // pushes refused in the phone's settings: the kinds' switches are pale — they would not come anyway
  const denied = push.state === "denied";
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
        {/* «Вибрация» — a setting of this device; the web has no vibration, so no switch there (as in main) */}
        {Platform.OS !== "web" ? <ToggleRow inGroup label={t("haptics.title")} caption={t("haptics.hint")} value={hapticsOn} onChange={setHapticsOn} /> : null}
        {!store && canSeeShowcase(mode, role) ? (
          <GroupRow wrap title={t("ds.title")} subtitle={t("ds.rowHint")} chevron onPress={() => router.push("/settings/design-system")} testID="settings-design-system" />
        ) : null}
      </ListGroup>

      <ListGroup title={t("pref7b.plan")} inset={space[4]} note={t("pref7b.showDoneHint")}>
        <ToggleRow inGroup label={t("plan5.showDone")} value={showDone} onChange={setShowDone} />
      </ListGroup>

      {db.location?.allowed ? (
        <ListGroup title={t("loc7b.title")} inset={space[4]}>
          <LocationSetting row />
        </ListGroup>
      ) : null}

      <ListGroup title={t("settings.hints")} inset={space[4]} note={t("settings.hintsText")}>
        <ActionRow inGroup label={t("more.showHints")} icon="help" onPress={() => { hints.reset(); toast.show("Подсказки включены"); }} />
      </ListGroup>

      <ListGroup title={t("push.title")} inset={space[4]} note={t(STATE_TEXT[push.state])}>
        {push.state === "on" || push.state === "off" ? <ToggleRow inGroup label={t("push.thisPhone")} value={push.state === "on"} onChange={(v) => void (v ? push.turnOn() : push.turnOff())} /> : null}
        {denied ? <GroupRow wrap title={t("push.openSettings")} chevron onPress={() => void Linking.openSettings().catch(() => undefined)} /> : null}
      </ListGroup>
      <ListGroup title={t("push.kinds.title")} inset={space[4]} note={denied ? "Не придут, пока не разрешите уведомления в настройках телефона." : t("push.kinds.note")}>
        {groups.map((g) => (
          <ToggleRow key={g} inGroup disabled={denied} label={t(`push.kind.${g}`)} caption={t(`push.kind.${g}.hint`)} value={pushGroupOn(db.pushPrefs, g)} onChange={(v) => setPushKind(g, v)} />
        ))}
      </ListGroup>

      <ListGroup title={t("settings.about")} inset={space[4]}>
        <View testID="about-brand" style={{ alignItems: "center", gap: space[2], paddingVertical: space[4] }}>
          <BrandLogo width={component.brand.about} />
          <T v="caption" tone="mut" tabular>
            {t("brand.about.version", { v: Constants.expoConfig?.version ?? "1.0.0", b: BUILD || "dev" })}
          </T>
          {/* the full version line with the moment it was published (rule 11) */}
          <VersionLine testID="about-version" />
        </View>
        {updatesSupported() ? <UpdateRow row /> : null}
        <GroupRow title={t("legal.terms.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.terms) })} chevron onPress={() => router.push(legalHref("terms"))} />
        <GroupRow title={t("legal.privacy.title")} subtitle={t("legal.edition", { date: editionLabel(LEGAL_VERSIONS.privacy) })} chevron onPress={() => router.push(legalHref("privacy"))} />
        <GroupRow title={t("support.title")} subtitle={t("support.subtitle")} chevron onPress={() => router.push("/help")} />
      </ListGroup>

      {mode === "demo" ? (
        <ListGroup title={t("settings.testing")} inset={space[4]} note={t("settings.testingHint")}>
          <ToggleRow
            inGroup
            label={t("offline.toggle")}
            value={!online}
            onChange={(off) => {
              const sent = setOnline(!off);
              if (!off) toast.show(t("offline.synced", { n: sent }));
            }}
          />
          <ActionRow inGroup label={t("more.resetDemo")} icon="sync" tone="bad" onPress={() => void reset()} testID="settings-reset" />
        </ListGroup>
      ) : null}
      {dialog}
    </Screen>
  );
}
