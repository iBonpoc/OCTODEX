import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import type { Role } from "@/data/types";
import { languages, useI18n, type Lang } from "@/i18n";
import { roleHome } from "@/nav/roles";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Button, Segmented, Toggle } from "@/ui/controls";
import { Icon, T } from "@/ui/primitives";
import { useToast } from "@/ui/overlays";
import { useHints } from "@/ui/hints";
import { useVersionLabel } from "@/features/version";
import { Card, CardList, ItemCard, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";

/** Settings for this device: role, theme, language, offline test switch. */
export default function More() {
  const { t, lang, setLang } = useI18n();
  const { db, role, setRole, online, setOnline, resetDemo, mode, companyName, availableRoles, queue, syncError, refresh, loading } = useStore();
  const unscheduled = db.jobs.filter((j) => j.status === "unscheduled").length;
  const auth = useAuth();
  const { pref, setPref } = useTheme();
  const toast = useToast();
  const hints = useHints();
  const versionLabel = useVersionLabel();
  const changeRole = (r: Role) => {
    setRole(r);
    router.navigate(`/${roleHome[r]}`);
  };
  return (
    <Screen title={t("more.title")}>
      <Card>
        <T v="heading">{t("account.title")}</T>
        {mode === "cloud" ? (
          <>
            <T v="body" w="semibold">
              {companyName}
            </T>
            <T v="caption" tone="mut">
              {auth.email}
            </T>
            <T v="caption" tone={syncError ? "bad" : queue.length ? "warn" : "ok"}>
              {syncError ? t("account.error", { msg: syncError }) : queue.length ? t("account.pending", { n: queue.length }) : t("account.synced")}
            </T>
            <RowView style={{ flexWrap: "wrap" }}>
              <Button label={t("account.refresh")} icon="sync" variant="secondary" disabled={loading} onPress={refresh} />
              <Button label={t("account.signOut")} variant="ghost" onPress={auth.signOut} />
            </RowView>
          </>
        ) : auth.session ? (
          <>
            <T v="caption" tone="mut">
              {auth.email} · {t("account.noCompany")}
            </T>
            <RowView style={{ flexWrap: "wrap" }}>
              <Button label={t("company.create")} icon="plus" onPress={() => router.push("/auth/company")} />
              <Button label={t("account.signOut")} variant="ghost" onPress={auth.signOut} />
            </RowView>
          </>
        ) : (
          <>
            <T v="caption" tone="mut">
              {t("account.demo")}
            </T>
            <Button label={t("account.signIn")} icon="user" onPress={() => router.push("/auth/sign-in")} />
          </>
        )}
      </Card>
      <MenuSection title={t("menu.work")}>
        <ItemCard title={t("jobs.title")} subtitle={unscheduled ? t("menu.jobsWaiting", { n: unscheduled }) : t("menu.jobsHint")} left={<Icon name="wrench" />} onPress={() => router.push("/jobs")} />
        {role === "director" ? <ItemCard title={t("plan.title")} subtitle={t("menu.planHint")} left={<Icon name="calendar" />} onPress={() => router.push("/plan")} /> : null}
        {role === "tech" ? <ItemCard title={t("sales.estimates")} left={<Icon name="invoice" />} onPress={() => router.push("/estimates")} /> : null}
        {role !== "tech" ? <ItemCard title={t("more.money")} subtitle={t("menu.moneyHint")} left={<Icon name="wallet" />} onPress={() => router.push("/money")} /> : null}
        <ItemCard title={t("more.catalog")} left={<Icon name="note" />} onPress={() => router.push("/catalog")} />
      </MenuSection>
      {role === "director" ? (
        <MenuSection title={t("menu.company")}>
          <ItemCard title={t("co.title")} subtitle={t("co.moreHint")} left={<Icon name="home2" />} onPress={() => router.push("/company")} />
          <ItemCard title={t("team.title")} subtitle={t("menu.teamHint", { n: db.members.length })} left={<Icon name="users" />} onPress={() => router.push("/team")} />
        </MenuSection>
      ) : null}
      <SectionTitle title={t("menu.app")} />
      <Card>
        <T v="heading">{t("more.role")}</T>
        <Segmented<Role>
          full
          value={role}
          onChange={changeRole}
          items={(["tech", "dispatcher", "director"] as Role[])
            .filter((r) => availableRoles.includes(r))
            .map((r) => ({ key: r, label: t(`role.${r}`) }))}
        />
        <T v="caption" tone="mut">
          {t("role.hint")}
        </T>
      </Card>
      <Card>
        <T v="heading">{t("more.theme")}</T>
        <Segmented<ThemePref>
          full
          value={pref}
          onChange={setPref}
          items={[
            { key: "system", label: t("more.themeSystem") },
            { key: "dark", label: t("more.dark") },
            { key: "light", label: t("more.light") },
          ]}
        />
      </Card>
      <Card>
        <T v="heading">{t("more.language")}</T>
        <Segmented<Lang> full value={lang} onChange={setLang} items={languages.map((l) => ({ key: l.id, label: l.label }))} />
      </Card>
      <SectionTitle title={t("menu.data")} />
      <Card>
        <T v="heading">{t("more.data")}</T>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="body" style={{ flex: 1 }}>
            {t("offline.toggle")}
          </T>
          <Toggle
            label={t("offline.toggle")}
            on={!online}
            onChange={(off) => {
              const sent = setOnline(!off);
              if (!off) toast.show(t("offline.synced", { n: sent }));
            }}
          />
        </RowView>
        <Button label={t("more.showHints")} icon="help" variant="secondary" onPress={hints.reset} />
        {mode === "demo" ? (
          <Button label={t("more.resetDemo")} icon="sync" variant="secondary" onPress={() => toast.show(t("more.resetDone"), resetDemo())} />
        ) : null}
      </Card>
      <View style={{ paddingHorizontal: space[2] }}>
        <T v="caption" tone="mut">
          {versionLabel}
        </T>
      </View>
    </Screen>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <SectionTitle title={title} />
      <CardList>{children}</CardList>
    </View>
  );
}
