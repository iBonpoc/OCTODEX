import { useEffect } from "react";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/cloud/auth";
import { gateFreePath } from "@/features/legal";

/**
 * «Условия изменились» (7а-1, docs/specs/19 §5): a signed-in person whose consent the server says is missing goes to
 * /auth/terms. Only on a known answer — without the network (`unknown`) and in the demo (no session) nothing happens,
 * so offline work and the e2e demo are never blocked. Not on sign-in, the documents, help, the client page.
 */
export function LegalGate() {
  const { session, legal } = useAuth();
  const path = usePathname();
  const need = !!session && (legal === "first" || legal === "changed");
  useEffect(() => {
    if (need && !gateFreePath(path)) router.push("/auth/terms");
  }, [need, path]);
  return null;
}
