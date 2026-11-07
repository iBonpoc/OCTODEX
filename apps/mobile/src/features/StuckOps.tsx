/**
 * «Не отправлено: сервер отвечает ошибкой» (docs/specs/23 §3): each change the server keeps answering with an error is
 * a card (rule 12) with «Повторить сейчас» and «Отменить изменение…». Discarding is irreversible: a second step says
 * what goes with it (rule 5) — the changes that wait for it leave the phone too.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useStore, type StuckOp } from "@/data/store";
import { useI18n } from "@/i18n";
import { stuckKindKey } from "@/data/syncLink";
import { Button, StatusChip } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { CardList, Card, SectionTitle } from "@/ui/surfaces";

function StuckCard({ op }: { op: StuckOp }) {
  const { t, day, time } = useI18n();
  const { retryOp, discardOp } = useStore();
  const [sure, setSure] = useState(false);
  // «Отменить изменение…» refused: it (or one that leaves with it) is on its way to the server right now
  const [busy, setBusy] = useState(false);
  return (
    <Card status="bad">
      <View testID={`stuck-${op.id}`} style={{ gap: space[2] }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
          <T v="body" w="semibold">
            {t(stuckKindKey(op.kind))}
          </T>
          {/* rule 2: the status is an icon and a word, not only the card's colour */}
          <StatusChip status="bad" label={op.sending ? t("sync.stuck.sending") : t("sync.stuck.chip")} />
        </View>
        <T v="caption" tone="mut">
          {t("sync.stuck.since", { when: `${day(op.since)} ${time(op.since)}` })}
          {op.waiting ? ` · ${t("sync.stuck.waiting", { n: op.waiting })}` : ""}
          {op.leaving ? ` · ${t("sync.stuck.leaving", { n: op.leaving })}` : ""}
        </T>
        {/* our own words: the server's text is English and technical (review #259) */}
        <T v="caption" tone="mut">
          {t("sync.stuck.note")}
        </T>
        {busy ? (
          <View testID={`stuck-busy-${op.id}`}>
            <T v="caption">{t("sync.stuck.busy")}</T>
          </View>
        ) : null}
        {!sure ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <Button label={t("sync.stuck.retry")} icon="refresh" variant="secondary" disabled={op.sending} onPress={() => retryOp(op.id)} />
            <Button label={t("sync.stuck.discard")} icon="trash" variant="ghost" disabled={op.sending} onPress={() => (setBusy(false), setSure(true))} />
          </View>
        ) : (
          <View testID={`stuck-confirm-${op.id}`} style={{ gap: space[2] }}>
            <T v="body">
              {op.leaving
                ? t("sync.stuck.sureWaiting", { what: op.leavingKinds.map((x) => `${t(x.key)}: ${x.n}`).join(", ") })
                : t("sync.stuck.sure")}
            </T>
            {op.leavingMoney ? (
              <View testID={`stuck-money-${op.id}`} style={{ gap: space[1] }}>
                <StatusChip status="warn" label={t("sync.stuck.moneyChip")} />
                <T v="caption">{t("sync.stuck.money")}</T>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              <Button
                label={t("sync.stuck.discardYes")}
                icon="trash"
                variant="secondary"
                disabled={op.sending}
                onPress={() => {
                  if (discardOp(op.id)) return;
                  setSure(false);
                  setBusy(true);
                }}
              />
              <Button label={t("sync.stuck.keep")} variant="ghost" onPress={() => setSure(false)} />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

/** the section in «Настройки»: nothing when nothing is stuck */
export function StuckOps() {
  const { t } = useI18n();
  const { stuckOps } = useStore();
  if (!stuckOps.length) return null;
  return (
    <>
      <SectionTitle title={t("sync.stuck.title")} />
      <CardList>
        {stuckOps.map((op) => (
          <StuckCard key={op.id} op={op} />
        ))}
      </CardList>
    </>
  );
}
