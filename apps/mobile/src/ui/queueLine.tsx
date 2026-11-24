import { useEffect, useState } from "react";
import { setQueueLineHeight } from "./queueLineHeight";
import { View } from "react-native";
import { router } from "expo-router";
import { component, size, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { stuckKindKey } from "@/data/syncLink";
import { useI18n, type DictKey } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { Sheet } from "./overlays";
import { Button } from "./controls";
import { CardList, Card } from "./surfaces";
import { queueLine, queueLineKey, type QueueLineSay } from "./queueLineRules";

/** what the line says now (null — nothing waits and the network is there) */
export function useQueueLine(): QueueLineSay | null {
  const { online, link, queue, stuckOps } = useStore();
  return queueLine(online, link, queue.length, stuckOps.length);
}

/**
 * «Ждёт отправки · N» (#2214, DS §15.3б): a thin line on the tab bar's own ground, right above the tabs — part of the bar, not a
 * layer over the content; the icon of the state + the words (never the colour alone, rule 2). A tap opens a sheet with what waits.
 * `say` — a fixed state (the showcase); otherwise the store's. `docked` — inside the tab bar (it reports its height to the toasts).
 */
export function QueueLine({ say: fixed, docked }: { say?: QueueLineSay | null; docked?: boolean }) {
  const live = useQueueLine();
  const say = fixed === undefined ? live : fixed;
  const { c } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!docked) return;
    setQueueLineHeight(say ? component.queueLine.h : 0);
    return () => setQueueLineHeight(0);
  }, [docked, say]);
  if (!say) return null;
  const label = t(queueLineKey(say) as DictKey, { n: say.n });
  return (
    <>
      <Press
        testID="queue-line"
        onPress={() => setOpen(true)}
        visibleHeight={component.queueLine.h}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t("ql.open")}
      >
        <View style={{ height: component.queueLine.h, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1], paddingHorizontal: space[4] }}>
          <Icon name={say.icon} s={size.iconSm} color={c.status[say.tone].text} />
          <T v="caption" w="semibold" numberOfLines={1}>
            {label}
          </T>
        </View>
      </Press>
      <QueueSheet visible={open} say={say} onClose={() => setOpen(false)} />
    </>
  );
}

/** the sheet of the line: what waits, one card each (rule 12), and why it waits */
function QueueSheet({ visible, say, onClose }: { visible: boolean; say: QueueLineSay; onClose: () => void }) {
  const { queue } = useStore();
  const { t, day, time } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("ql.title")}>
      <T v="body" tone="mut">
        {t(say.state === "offline" ? "ql.hintOffline" : say.state === "server" ? "ql.hintServer" : say.state === "stuck" ? "ql.hintStuck" : "ql.hintWaiting")}
      </T>
      {queue.length ? (
        <CardList>
          {queue.map((q) => (
            <Card key={q.id}>
              <View testID={`queue-item-${q.id}`} style={{ gap: space[1] }}>
                <T v="body" w="semibold">
                  {t(stuckKindKey(q.label))}
                </T>
                <T v="caption" tone="mut">
                  {`${day(q.at)} ${time(q.at)}`}
                </T>
              </View>
            </Card>
          ))}
        </CardList>
      ) : (
        <T v="body">{t("ql.none")}</T>
      )}
      {say.state === "stuck" ? (
        <Button
          label={t("ql.toStuck")}
          variant="secondary"
          full
          onPress={() => {
            onClose();
            router.push("/settings/profile");
          }}
        />
      ) : null}
    </Sheet>
  );
}
