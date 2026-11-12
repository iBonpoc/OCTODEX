import { useEffect, useState } from "react";
import { View } from "react-native";
import { motion, space } from "@octo/design-tokens";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, SectionTitle, SyncBadge } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

/** Notices (DS §15): a toast, a toast with «Отменить» for 5 seconds, the «no network» badge. Each one is live. */
export function NoticesSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { online, setOnline } = useStore();
  const s = SECTIONS.find((x) => x.id === "notices")!;
  const [undone, setUndone] = useState(0);
  // leaving the screen puts the network back: the sample must not leave the app offline
  useEffect(() => () => void setOnline(true), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID="showcase-notices">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
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
          <Button label={t("ds.note.undoShow")} variant="secondary" onPress={() => toast.show(t("ds.note.undoText"), () => setUndone((n) => n + 1))} />
        </View>
        <View testID="showcase-note-undone">
          <T v="body">{t("ds.note.undone", { n: undone })}</T>
        </View>
      </Card>
      <Card>
        <T v="heading">{t("ds.note.offline")}</T>
        <T v="caption" tone="mut">{t("ds.note.offlineHint")}</T>
        <View testID="showcase-note-offline">
          <Button label={online ? t("ds.note.offlineOn") : t("ds.note.offlineOff")} variant="secondary" onPress={() => void setOnline(!online)} />
        </View>
        <View testID="showcase-note-badge" style={{ minHeight: space[6] }}>
          <SyncBadge />
        </View>
      </Card>
      <Card>
        <T v="caption" tone="mut">{t("ds.note.later")}</T>
      </Card>
    </View>
  );
}
