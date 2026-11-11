import { useState } from "react";
import { View } from "react-native";
import { space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { Card, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

type Which = null | "fit" | "footer" | "medium" | "large" | "pages";

/** Windows (DS §10): the sheet in every height, with the pinned bottom bar and with a page inside. */
export function WindowsSection() {
  const { t } = useI18n();
  const [open, setOpen] = useState<Which>(null);
  const [page, setPage] = useState(1);
  const s = SECTIONS.find((x) => x.id === "windows")!;
  const close = () => {
    setOpen(null);
    setPage(1);
  };
  const long = Array.from({ length: 40 }, (_, i) => i + 1);
  const row = (id: Exclude<Which, null>, label: string, hint: string) => (
    <View key={id} testID={`showcase-sheet-${id}`} style={{ gap: space[1] }}>
      <Button label={label} variant="secondary" onPress={() => setOpen(id)} />
      <T v="caption" tone="mut">
        {hint}
      </T>
    </View>
  );
  return (
    <View testID="showcase-windows">
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      <Card>
        {row("fit", t("ds.sheet.fit"), t("ds.sheet.fitHint"))}
        {row("footer", t("ds.sheet.footer"), t("ds.sheet.footerHint"))}
        {row("medium", t("ds.sheet.medium"), t("ds.sheet.mediumHint"))}
        {row("large", t("ds.sheet.large"), t("ds.sheet.largeHint"))}
        {row("pages", t("ds.sheet.pages"), t("ds.sheet.pagesHint"))}
      </Card>
      <Sheet visible={open === "fit"} onClose={close} title={t("ds.sheet.fit")}>
        <T v="body">{t("ds.sheet.body")}</T>
      </Sheet>
      <Sheet
        visible={open === "footer"}
        onClose={close}
        title={t("ds.sheet.footer")}
        footer={<Button label={t("ds.sheet.save")} full onPress={close} />}
      >
        {long.map((n) => (
          <T key={n} v="body">{`${t("ds.sheet.line")} ${n}`}</T>
        ))}
      </Sheet>
      <Sheet
        visible={open === "medium"}
        onClose={close}
        title={t("ds.sheet.medium")}
        height="medium"
        footer={<Button label={t("ds.sheet.save")} full onPress={close} />}
      >
        <T v="body">{t("ds.sheet.body")}</T>
      </Sheet>
      <Sheet visible={open === "large"} onClose={close} title={t("ds.sheet.large")} height="large" footer={<Button label={t("ds.sheet.save")} full onPress={close} />}>
        <T v="body">{t("ds.sheet.body")}</T>
      </Sheet>
      <Sheet
        visible={open === "pages"}
        onClose={close}
        title={page === 1 ? t("ds.sheet.pages") : t("ds.sheet.page2")}
        onBack={page === 2 ? () => setPage(1) : undefined}
        footer={page === 1 ? <Button label={t("ds.sheet.next")} full onPress={() => setPage(2)} /> : <Button label={t("ds.sheet.save")} full onPress={close} />}
      >
        <T v="body">{page === 1 ? t("ds.sheet.body") : t("ds.sheet.page2Body")}</T>
      </Sheet>
    </View>
  );
}
