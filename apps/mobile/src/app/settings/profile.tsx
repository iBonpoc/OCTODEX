import { View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useAuth } from "@/cloud/auth";
import type { Role } from "@/data/types";
import { useI18n } from "@/i18n";
import { roleHome } from "@/nav/roles";
import { goTo } from "@/nav/go";
import { ClosedCompanies } from "@/features/ClosedCompany";
import { Button, Segmented, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { Card, ListRow, RowView, Screen, SectionTitle } from "@/ui/surfaces";
import { StuckOps } from "@/features/StuckOps";

/**
 * «Профиль и аккаунт» (spec 26, founder 07.11: the profile card and «Мои настройки» led to the same screen).
 * The profile card of «Ещё» opens it: the account and sync, my signature for contracts, the role, deleting the account.
 * How the app looks and behaves is «Настройки приложения» (/settings).
 */
export default function Profile() {
  const { t } = useI18n();
  const { role, setRole, mode, companyName, availableRoles, queue, syncError, refresh, loading } = useStore();
  const auth = useAuth();
  // the profile sits above the tabs: go DOWN to the new role's home (dismissTo), navigate would leave this card on top
  // (lesson of #274; goTo = dismissTo when it can, else replace)
  const changeRole = (r: Role) => {
    setRole(r);
    goTo(`/${roleHome[r]}`);
  };
  return (
    <Screen title={t("fix.settings.profile")}>
      <SectionTitle title={t("account.title")} />
      <Card>
        {mode === "cloud" ? (
          <>
            <T v="body" w="semibold">
              {companyName}
            </T>
            <T v="caption" tone="mut">
              {auth.email}
            </T>
            {/* a status is an icon + a word (rule 2), not coloured text alone (review #289) */}
            <StatusChip
              status={syncError ? "bad" : queue.length ? "warn" : "ok"}
              label={syncError ? t("account.error", { msg: syncError }) : queue.length ? t("account.pending", { n: queue.length }) : t("account.synced")}
              soft
            />
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
            {/* 7а-3 «в»: the company was closed by its owner, and what still waits for it (docs/specs/22 §3.6) */}
            <ClosedCompanies />
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
        {/* E2b-2 (docs/specs/07): the employee's own signature for contracts */}
        <Button label={t("est.sig.settingsRow")} icon="pencil" variant="secondary" onPress={() => router.push("/estimate/signature")} />
      </Card>

      {/* docs/specs/23 §3: changes the server keeps answering with an error — under the account and its sync, to retry or discard */}
      <StuckOps />

      {availableRoles.length > 1 ? (
        <Card>
          <T v="heading">{t("more.role")}</T>
          <Segmented<Role>
            full
            value={role}
            onChange={changeRole}
            items={(["tech", "dispatcher", "director", "sales"] as Role[]).filter((r) => availableRoles.includes(r)).map((r) => ({ key: r, label: t(`role.${r}`) }))}
          />
          <T v="caption" tone="mut">
            {t("role.hint")}
          </T>
        </Card>
      ) : null}

      {/* 7а-2b (S22, Apple 5.1.1(v)): the very bottom; signed in with or without a company, and in the demo (it explains) */}
      <Card>
        <View testID="settings-delete-account">
          <ListRow title={t("acct.title")} subtitle={t("acct.row")} onPress={() => router.push("/settings/delete-account")} />
        </View>
      </Card>
    </Screen>
  );
}
