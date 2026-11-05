import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import { useI18n } from "@/i18n";
import { Avatar } from "@/ui/controls";
import { Icon } from "@/ui/primitives";
import { CardList, ItemCard, Screen, SectionTitle } from "@/ui/surfaces";

/**
 * "More" = only places to go (docs/specs/05-menu-and-settings.md §2).
 * Nothing here switches anything: theme, language, role, offline and demo data live in Settings.
 */
export default function More() {
  const { t } = useI18n();
  const { db, role, mode, companyName, queue, syncError } = useStore();
  const auth = useAuth();
  const me = db.members.find((m) => m.id === db.me);
  const unscheduled = db.jobs.filter((j) => j.status === "unscheduled").length;
  const sync = mode !== "cloud" ? t("settings.demoShort") : syncError ? t("settings.syncError") : queue.length ? t("account.pending", { n: queue.length }) : t("account.synced");
  const who = mode === "cloud" ? (companyName ?? "") : auth.session ? t("account.noCompany") : t(`role.${role}`);
  return (
    <Screen title={t("more.title")}>
      <CardList>
        <ItemCard
          title={me?.name ?? auth.email ?? t("settings.title")}
          subtitle={`${who} · ${sync}`}
          left={<Avatar initials={me?.initials ?? "··"} />}
          onPress={() => router.push("/settings")}
        />
      </CardList>
      <MenuSection title={t("menu.sections")}>
        <ItemCard title={t("jobs.title")} subtitle={unscheduled ? t("menu.jobsWaiting", { n: unscheduled }) : t("menu.jobsHint")} left={<Icon name="wrench" />} onPress={() => router.push("/jobs")} />
        {role === "director" ? <ItemCard title={t("plan.title")} subtitle={t("menu.planHint")} left={<Icon name="calendar" />} onPress={() => router.push("/plan")} /> : null}
        {role === "tech" ? <ItemCard title={t("sales.estimates")} left={<Icon name="invoice" />} onPress={() => router.push("/estimates")} /> : null}
        {role !== "tech" ? <ItemCard title={t("more.money")} subtitle={t("menu.moneyHint")} left={<Icon name="wallet" />} onPress={() => router.push("/money")} /> : null}
        <ItemCard title={t("more.catalog")} left={<Icon name="note" />} onPress={() => router.push("/catalog")} />
      </MenuSection>
      {role === "director" ? (
        <MenuSection title={t("menu.company")}>
          <ItemCard title={t("menu.companySettings")} subtitle={t("co.moreHint")} left={<Icon name="home2" />} onPress={() => router.push("/company")} />
          <ItemCard title={t("team.title")} subtitle={t("menu.teamHint", { n: db.members.length })} left={<Icon name="users" />} onPress={() => router.push("/team")} />
        </MenuSection>
      ) : null}
      <CardList>
        <ItemCard title={t("settings.title")} subtitle={t("settings.hint")} left={<Icon name="sliders" />} onPress={() => router.push("/settings")} />
      </CardList>
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
