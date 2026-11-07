/**
 * «Не отправлено: сервер отвечает ошибкой» (docs/specs/23 §3): each change the server keeps answering with an error is
 * a card (rule 12) with «Повторить сейчас» and «Отменить изменение…». Discarding is irreversible: a second step says
 * what goes with it (rule 5) — the changes that wait for it leave the phone too.
 */
import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { router, type Href } from "expo-router";
import { useStore, type StuckOp } from "@/data/store";
import type { RejectedOp } from "@/data/outboxRejected";
import { useI18n } from "@/i18n";
import { stuckKindKey } from "@/data/syncLink";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { CardList, Card, SectionTitle } from "@/ui/surfaces";

function StuckCard({ op }: { op: StuckOp }) {
  const { t, day, time } = useI18n();
  const { retryOp, discardOp } = useStore();
  const [sure, setSure] = useState(false);
  return (
    <Card status="bad">
      <View testID={`stuck-${op.id}`} style={{ gap: space[2] }}>
        <T v="body" w="semibold">
          {t(stuckKindKey(op.kind))}
        </T>
        <T v="caption" tone="mut">
          {t("sync.stuck.since", { when: `${day(op.since)} ${time(op.since)}` })}
          {op.waiting ? ` · ${t("sync.stuck.waiting", { n: op.waiting })}` : ""}
        </T>
        {op.error ? (
          <T v="caption" tone="mut" numberOfLines={2}>
            {op.error}
          </T>
        ) : null}
        {!sure ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            <Button label={t("sync.stuck.retry")} icon="refresh" variant="secondary" onPress={() => retryOp(op.id)} />
            <Button label={t("sync.stuck.discard")} icon="trash" variant="ghost" onPress={() => setSure(true)} />
          </View>
        ) : (
          <View testID={`stuck-confirm-${op.id}`} style={{ gap: space[2] }}>
            <T v="body">{op.waiting ? t("sync.stuck.sureWaiting", { n: op.waiting }) : t("sync.stuck.sure")}</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              <Button label={t("sync.stuck.discardYes")} icon="trash" variant="secondary" onPress={() => discardOp(op.id)} />
              <Button label={t("sync.stuck.keep")} variant="ghost" onPress={() => setSure(false)} />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}

/** a money change the server refused: what it was, why, «Открыть» the record, «Понятно» */
function RejectedCard({ r }: { r: RejectedOp }) {
  const { t, money, day, time } = useI18n();
  const { dismissRejected } = useStore();
  return (
    <Card status="bad">
      <View testID={`rejected-${r.id}`} style={{ gap: space[2] }}>
        <T v="body" w="semibold">
          {t(`att.rejected.${r.what}`)}
          {r.amountCents != null ? ` · ${money(r.amountCents)}` : ""}
        </T>
        <T v="caption" tone="mut">
          {`${day(r.at)} ${time(r.at)}`} · {t("sync.rejected.hint")}
        </T>
        {r.error ? (
          <T v="caption" tone="mut" numberOfLines={2}>
            {r.error}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <Button label={t("sync.rejected.open")} icon="chevronRight" variant="secondary" onPress={() => router.push(r.href as Href)} />
          <Button label={t("sync.rejected.ok")} icon="check" variant="ghost" onPress={() => dismissRejected(r.id)} />
        </View>
      </View>
    </Card>
  );
}

/** the sections in «Настройки»: nothing when nothing is stuck or refused */
export function StuckOps() {
  const { t } = useI18n();
  const { stuckOps, rejectedOps } = useStore();
  return (
    <>
      {rejectedOps.length ? (
        <>
          <SectionTitle title={t("sync.rejected.title")} />
          <CardList>
            {rejectedOps.map((r) => (
              <RejectedCard key={r.id} r={r} />
            ))}
          </CardList>
        </>
      ) : null}
      {stuckOps.length ? (
        <>
          <SectionTitle title={t("sync.stuck.title")} />
          <CardList>
            {stuckOps.map((op) => (
              <StuckCard key={op.id} op={op} />
            ))}
          </CardList>
        </>
      ) : null}
    </>
  );
}
