/**
 * The company switcher (spec 42 S34, S32, §7.1, §14; #1673). One sheet «Компании», opened from «Главная» (the company's
 * name ▾ under the title), the menu «Ещё» and the side menu — only for a person in two or more companies:
 * - rows `ListRow` (rule 12): the name · the role · «не отправлено N» (warn, icon + word) · the check of the current one;
 *   below — «＋ Создать компанию»;
 * - a choice: my changes here go first (≤ 10 s with the network), what is left is said («Отправятся, когда вы вернётесь»)
 *   with «Перейти» / «Остаться»; then Главная of the other company. Nothing unsent is lost: each change keeps its company
 *   (outboxOwner.ts) and goes when the person is back there.
 * - The switch mounts the app again with the other company's data (the store's cache key): the toast «Вы в «B»» comes
 *   from CompanySwitchNotice after the remount (auth.switched), with «Отменить» back to the company before when it was
 *   opened for the person (an invitation accepted, a company created).
 * The sheet host and the notice are mounted once in the root layout (Shell).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { component, size, space } from "@octo/design-tokens";
import { useAuth, type Membership } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { localUndo } from "@/data/undo";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, StatusChip } from "@/ui/controls";
import { ButtonPair } from "@/ui/pairs";
import { useHeldSheet } from "@/ui/heldSheet";
import { Sheet, useToast } from "@/ui/overlays";
import { Icon, Press, T } from "@/ui/primitives";
import { Card, ListRow } from "@/ui/surfaces";

/* ---------- open from anywhere: a tiny store outside React (the host lives in Shell) ---------- */
let sheetOpen = false;
const listeners = new Set<() => void>();
const setSheet = (v: boolean) => {
  sheetOpen = v;
  listeners.forEach((l) => l());
};
export const openCompanies = () => setSheet(true);
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const useSheetOpen = () => useSyncExternalStore(subscribe, () => sheetOpen, () => false);

/** two or more companies: the switcher is offered (one company — just its name, nothing to press) */
export function useCanSwitch(): boolean {
  const auth = useAuth();
  return !!auth.session && auth.memberships.length >= 2;
}

export const roleKey = (m: Membership): DictKey => `people.switch.role.${m.role}` as DictKey;

/** «Главная»: the company's name ▾ under the title (only with two or more companies) */
export function CompanyLine() {
  const auth = useAuth();
  const { t } = useI18n();
  const { c } = useTheme();
  const can = useCanSwitch();
  const name = auth.company?.companyName ?? "";
  if (!can) return null;
  return (
    <Press
      testID="company-switch"
      onPress={openCompanies}
      visibleHeight={size.hitMin}
      accessibilityRole="button"
      accessibilityLabel={t("people.switch.open", { name })}
      style={{ flexDirection: "row", alignItems: "center", gap: space[1], alignSelf: "flex-start", minHeight: size.hitMin }}
    >
      <T v="body" w="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </T>
      <Icon name="chevronDown" s={size.iconSm} color={c.mut} />
    </Press>
  );
}

/** «Главная» of a company never opened on this phone, without the network (§7.1): what to do, not an empty company */
export function CompanyWaiting() {
  const auth = useAuth();
  const { t } = useI18n();
  const { companyLoaded, online, mode } = useStore();
  if (mode !== "cloud" || companyLoaded || online) return null;
  const name = auth.company?.companyName ?? "";
  return (
    <View testID="company-waiting">
      <Card style={{ gap: space[2] }}>
        <T v="heading">{t("people.switch.waitTitle", { name })}</T>
        <T v="body" tone="mut">
          {t("people.switch.waitBody", { name })}
        </T>
        {auth.memberships.length >= 2 ? <Button testID="company-waiting-switch" label={t("people.switch.title")} variant="secondary" full onPress={openCompanies} /> : null}
      </Card>
    </View>
  );
}

type Left = { to: Membership; from: Membership; n: number };

/** the sheet «Компании» (mounted once, in Shell) */
export function CompanySheetHost() {
  const auth = useAuth();
  const store = useStore();
  const { t } = useI18n();
  const open = useSheetOpen() && auth.memberships.length >= 2;
  const held = useHeldSheet(open ? auth.memberships : null);
  const [sending, setSending] = useState<string | null>(null);
  const [left, setLeft] = useState<Left | null>(null);
  const list = held.value ?? [];
  const current = auth.company;
  // each choice and each closing takes a ticket: a send that ends after the sheet was closed or another company was
  // chosen switches nothing (code-review of (г) №1)
  const ticket = useRef(0);
  const close = () => {
    ticket.current += 1;
    setSheet(false);
    setLeft(null);
    setSending(null);
  };
  // the other company: closed sheets and windows, Главная, then the switch (the app mounts again: spec 42 §12.2 Б-3)
  const go = (to: Membership) => {
    close();
    // only a company still among the memberships; then Главная (the app mounts again with it)
    if (auth.switchCompany(to.companyId)) router.replace("/");
  };
  const choose = async (to: Membership) => {
    if (!current || to.companyId === current.companyId) return close();
    const mine = ++ticket.current;
    setSending(to.companyId);
    const n = await store.sendBeforeSwitch(10_000);
    if (mine !== ticket.current) return;
    setSending(null);
    if (n > 0) return setLeft({ to, from: current, n });
    go(to);
  };
  return (
    <Sheet visible={held.visible} onExited={held.onExited} onClose={close} title={t("people.switch.title")}>
      <View testID="company-sheet" key={held.opening} style={{ gap: space[2] }}>
        {left ? (
          <View testID="company-left" style={{ gap: space[3] }}>
            <T v="heading">{t("people.switch.leftTitle", { name: left.from.companyName })}</T>
            <T v="body">{t("people.switch.leftBody", { name: left.from.companyName, n: left.n })}</T>
            <ButtonPair
              main={{ testID: "company-left-go", label: t("people.switch.go"), variant: "primary", onPress: () => go(left.to) }}
              second={{ testID: "company-left-stay", label: t("people.switch.stay"), variant: "secondary", onPress: close }}
            />
          </View>
        ) : (
          <>
            {list.map((m) => {
              const here = m.companyId === current?.companyId;
              const n = store.unsentIn(m.companyId);
              return (
                // while my changes go (≤ 10 s) the other rows dim: the wait is seen at the row pressed (design-review №4)
                <View key={m.companyId} testID={`company-row-${m.companyId}`} style={sending && sending !== m.companyId ? { opacity: component.dimOpacity } : undefined}>
                  <ListRow
                    title={m.companyName}
                    subtitle={sending === m.companyId ? t("people.switch.sending") : t(roleKey(m))}
                    selected={here}
                    chevron={false}
                    minHeight={component.rowOption}
                    onPress={sending ? undefined : () => void choose(m)}
                    right={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                        {n > 0 ? <StatusChip status="warn" label={t("people.switch.unsent", { n })} /> : null}
                        {here ? <Icon name="check" s={size.iconSm} /> : null}
                      </View>
                    }
                  />
                </View>
              );
            })}
            <Button
              testID="company-create"
              label={t("people.switch.create")}
              icon="plus"
              variant="secondary"
              full
              disabled={!!sending}
              onPress={() => {
                close();
                router.push("/auth/company?new=1");
              }}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

/**
 * After a switch (the app has mounted again with the other company): «Вы в «B»», «Вас добавили в «B»» or «Компания «B»
 * создана». When the company was opened for the person (joined, created), «Отменить» goes back to the one before.
 */
export function CompanySwitchNotice() {
  const auth = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const s = auth.switched;
  // the switch mounts the app again a moment later (the store's cache key): an instance mounted BEFORE the switch would
  // show the toast into a provider that is about to go (e2e 432/433 caught it) — it waits; the new instance shows it
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (!s) return;
    const say = () => {
      auth.clearSwitched();
      const name = s.to.companyName;
      const text = t(s.why === "joined" ? "people.switch.joined" : s.why === "created" ? "people.switch.created" : "people.switch.now", { name });
      const back = s.back;
      toast.show(
        text,
        back
          ? // the way back is the sign-in's own state (which company is open), not a store action
            localUndo(() => {
              router.replace("/");
              auth.switchCompany(back.companyId);
            })
          : undefined,
      );
    };
    if (mountedAt.current >= s.at) return say();
    // mounted before it: shown only if this instance is still here a little later (no remount came)
    const timer = setTimeout(say, SAY_LATE_MS);
    return () => clearTimeout(timer);
  }, [s, auth, toast, t]);
  return null;
}

/** how long an instance mounted before the switch waits for the remount before it shows the toast itself */
export const SAY_LATE_MS = 1500;
