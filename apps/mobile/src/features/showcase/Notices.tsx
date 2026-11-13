import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { motion, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, Empty, SectionTitle, SyncBadge } from "@/ui/surfaces";
import { EmptyFilter, EmptySearch, NotFound, PageNotFound } from "@/ui/emptyStates";
import { DemoBadge } from "@/features/DemoBadge";
import { SECTIONS } from "./registry";
import { localUndo, TOO_LATE } from "@/data/undo";

/** Notices (DS §15): a toast, a toast with «Отменить» for 5 seconds, the «no network» badge. Each one is live. */
export function NoticesSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { online, setOnline, mode } = useStore();
  const cloud = mode === "cloud";
  const was = useRef<boolean | null>(null); // the network value before this screen changed it (null: not changed here)
  const onlineNow = useRef(online);
  onlineNow.current = online;
  const s = SECTIONS.find((x) => x.id === "notices")!;
  const [undone, setUndone] = useState(0);
  const [pressed, setPressed] = useState<string | null>(null);
  // leaving the screen puts the network back — only if this screen changed it (the demo queue must not be reset otherwise)
  useEffect(() => () => { if (was.current !== null) void setOnline(was.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID="showcase-notices">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      {/* DS §13 (Н-65): the empty states, one wording each; the lists take them in later steps */}
      <View testID="showcase-states" style={{ gap: space[3] }}>
        <T v="heading">{t("ds.state.title")}</T>
        <T v="caption" tone="mut">{t("ds.state.hint")}</T>
        <Empty
          icon="invoice"
          title={t("ds.state.noneTitle")}
          hint={t("ds.state.noneHint")}
          testID="showcase-state-none"
          action={<Button label={t("ds.state.noneBtn")} onPress={() => setPressed(t("ds.state.noneBtn"))} />}
        />
        <EmptyFilter testID="showcase-state-filter" onReset={() => setPressed(t("empty.filterReset"))} />
        <EmptySearch testID="showcase-state-search" q="Roof" inAll={{ n: 3, onShow: () => setPressed(t("empty.searchAll", { n: 3 })) }} />
        <NotFound testID="showcase-state-notfound" title={t("ds.state.notFoundTitle")} listLabel={t("ds.state.notFoundBtn")} onList={() => setPressed(t("ds.state.notFoundBtn"))} />
        <PageNotFound testID="showcase-state-page" />
        <View testID="showcase-state-pressed">
          <T v="caption">{pressed ? t("ds.state.pressed", { name: pressed }) : t("ds.hap.none")}</T>
        </View>
      </View>
      <Card>
        <T v="heading">{t("ds.note.toast")}</T>
        <T v="caption" tone="mut">{t("ds.note.toastHint")}</T>
        <View testID="showcase-note-toast">
          <Button label={t("ds.note.toastShow")} variant="secondary" onPress={() => toast.show(t("ds.note.toastText"))} />
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.note.undo")}</T>
        <T v="caption" tone="mut">{t("ds.note.undoHint", { s: motion.toastUndoMs / 1000 })}</T>
        <View testID="showcase-note-undo">
          <Button label={t("ds.note.undoShow")} variant="secondary" onPress={() => toast.show(t("ds.note.undoText"), localUndo(() => setUndone((n) => n + 1)))} />
        </View>
        <View testID="showcase-note-undone">
          <T v="body">{t("ds.note.undone", { n: undone })}</T>
        </View>
      </Card>
      {/* #1193 п.6 (DS §15.2): «Отменить» that is too late — the thing was changed since: nothing is taken back, the toast says so */}
      <Card>
        <T v="heading">{t("ds.note.late")}</T>
        <T v="caption" tone="mut">{t("ds.note.lateHint")}</T>
        <View testID="showcase-note-late">
          <Button label={t("ds.note.lateShow")} variant="secondary" onPress={() => toast.show(t("ds.note.lateText"), TOO_LATE)} />
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.note.offline")}</T>
        <T v="caption" tone="mut">{t("ds.note.offlineHint")}</T>
        {cloud ? null : (
          <View testID="showcase-note-offline">
            <Button
              label={online ? t("ds.note.offlineOn") : t("ds.note.offlineOff")}
              variant="secondary"
              onPress={() => {
                if (was.current === null) was.current = onlineNow.current;
                void setOnline(!online);
              }}
            />
          </View>
        )}
        <View testID="showcase-note-badge" style={{ minHeight: space[6] }}>
          <SyncBadge />
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.note.demo")}</T>
        <T v="caption" tone="mut">{t("ds.note.demoHint")}</T>
        <View testID="showcase-note-demo">
          <DemoBadge always />
        </View>
      </Card>
      <Card>
        <T v="caption" tone="mut">{t("ds.note.later")}</T>
      </Card>
    </View>
  );
}
