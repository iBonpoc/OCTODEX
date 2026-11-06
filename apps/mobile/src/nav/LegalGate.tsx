import { useEffect } from "react";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { gateFreePath } from "@/features/legal";
import { useI18n } from "@/i18n";
import { useToast } from "@/ui/overlays";

/**
 * «Условия изменились» (7а-1, docs/specs/19 §5): a signed-in person whose consent the server says is missing goes to
 * /auth/terms. Only on a known answer — without the network (`unknown`) and in the demo (no session) nothing happens,
 * so offline work and the e2e demo are never blocked. Not on sign-in, the documents, help, the client page.
 */
export function LegalGate() {
  const { session, legal, accountDeleted, setAccountDeleted } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const path = usePathname();
  // 7а-2b (S22): the account was just deleted — from the screen, or finished quietly on start / sign-in: the sign-in
  // screen and «Аккаунт удалён», once
  useEffect(() => {
    if (!accountDeleted) return;
    setAccountDeleted(false);
    router.replace("/auth/sign-in");
    toast.show(t("acct.done"));
  }, [accountDeleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const need = !!session && (legal === "first" || legal === "changed");
  useEffect(() => {
    if (need && !gateFreePath(path)) router.push("/auth/terms");
  }, [need, path]);
  return null;
}
