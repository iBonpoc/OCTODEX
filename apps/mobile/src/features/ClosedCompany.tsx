/**
 * 7а-3 «в» (S22b; docs/specs/22 §3.6): «Компания «X» закрыта владельцем» — on «Создать компанию» and in «Профиль и
 * аккаунт». The changes still waiting for that company are named; «Убрать…» asks first (rule 5): they cannot come back.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button, StatusChip } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, CardList } from "@/ui/surfaces";
import { closedDay, type ClosedCompany } from "./closedCompany";

function ClosedCard({ c }: { c: ClosedCompany }) {
  const { t } = useI18n();
  const { unsentIn, dropUnsentIn } = useStore();
  const toast = useToast();
  const [sure, setSure] = useState(false);
  // «Убрать» refused: one of them is on its way to the server right now
  const [busy, setBusy] = useState(false);
  const n = unsentIn(c.companyId);
  return (
    <Card status="warn">
      <View testID={`closed-${c.companyId}`} style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
          <T v="body" w="semibold" style={{ flex: 1 }}>
            {t("fr9.closed.title", { company: c.name })}
          </T>
          {/* rule 2: an icon and a word, not only the card's colour */}
          <StatusChip status="warn" label={t("fr9.closed.chip")} />
        </View>
        <T v="caption" tone="mut">
          {t("fr9.closed.text", { date: closedDay(c.closedAt) })}
        </T>
        {n > 0 ? (
          <View testID={`closed-unsent-${c.companyId}`} style={{ gap: space[2] }}>
            <T v="caption">{t("fr9.closed.unsent", { n })}</T>
            {busy ? <T v="caption">{t("sync.stuck.busy")}</T> : null}
            {!sure ? (
              <View testID={`closed-drop-${c.companyId}`}>
                <Button label={t("fr9.closed.drop")} icon="trash" variant="ghost" onPress={() => (setBusy(false), setSure(true))} />
              </View>
            ) : (
              <View style={{ gap: space[2] }}>
                <T v="body">{t("fr9.closed.dropSure", { n })}</T>
                <View testID={`closed-drop-yes-${c.companyId}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
                  <Button
                    label={t("fr9.closed.dropYes")}
                    icon="trash"
                    variant="secondary"
                    onPress={() => {
                      const ok = dropUnsentIn(c.companyId);
                      setSure(false);
                      setBusy(!ok);
                      if (ok) toast.show(t("fr9.closed.dropped"));
                    }}
                  />
                  <Button label={t("fr9.closed.keep")} variant="ghost" onPress={() => setSure(false)} />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** nothing when the person has a company or no closed one (the server says which, auth.closedCompanies) */
export function ClosedCompanies() {
  const auth = useAuth();
  if (auth.company || !auth.closedCompanies.length) return null;
  return (
    <CardList>
      {auth.closedCompanies.map((c) => (
        <ClosedCard key={c.companyId} c={c} />
      ))}
    </CardList>
  );
}
