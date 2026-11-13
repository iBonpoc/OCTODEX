import { useState } from "react";
import { useHeldSheet } from "@/ui/heldSheet";
import { View } from "react-native";
import { motion, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/controls";
import { Sheet, SheetScroll } from "@/ui/overlays";
import { Icon, T } from "@/ui/primitives";
import { Card, ListRow, SectionTitle } from "@/ui/surfaces";
import { SECTIONS } from "./registry";

type Which = null | "fit" | "footer" | "medium" | "large" | "pages" | "stuck" | "chainA" | "chainB" | "chainC" | "list";

/** the third step of the chain: mounted by the owner's condition and recreated at each opening — the way a sheet is meant to be mounted */
function ChainSheetC({ visible, onExited, onClose }: { visible: boolean; onExited: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onExited={onExited} onClose={onClose} title={t("ds.sheet.chainC")}>
      <T v="body">{t("ds.sheet.chainBodyC")}</T>
    </Sheet>
  );
}

/** Windows (DS §10): the sheet in every height, with the pinned bottom bar and with a page inside. */
export function WindowsSection() {
  const { t } = useI18n();
  const [open, setOpen] = useState<Which>(null);
  const [page, setPage] = useState(1);
  const [item, setItem] = useState<string | null>(null); // the owner that empties its data when it closes
  const [asked, setAsked] = useState(0);
  const [selfOpen, setSelfOpen] = useState(false); // the owner closes it by itself, from outside (a timer, a result): the person's close that is under way must not ask after it
  const [selfAsked, setSelfAsked] = useState(0);
  const [selfDone, setSelfDone] = useState(0);
  const chainC = useHeldSheet(open === "chainC" ? "c" : null); // a sheet mounted by the owner's condition: it goes out led, and starts fresh // how many times the stubborn sheet was asked to close
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
        {row("list", t("ds.sheet.list"), t("ds.sheet.listHint"))}
        {row("stuck", t("ds.sheet.stuck"), t("ds.sheet.stuckHint"))}
        {row("chainA", t("ds.sheet.chain"), t("ds.sheet.chainHint"))}
        <View testID="showcase-sheet-self" style={{ gap: space[1] }}>
          <Button label={t("ds.sheet.self")} variant="secondary" onPress={() => setSelfOpen(true)} />
          <Button testID="showcase-self-close-outside" label={t("ds.sheet.selfOutside")} variant="ghost" onPress={() => setSelfOpen(false)} />
          <T v="caption" tone="mut">
            {t("ds.sheet.selfHint")}
          </T>
          <View testID="showcase-self-asked">
            <T v="caption">{t("ds.sheet.selfAsked", { n: selfAsked })}</T>
          </View>
        </View>
        <View testID="showcase-sheet-empties" style={{ gap: space[1] }}>
          <Button label={t("ds.sheet.empties")} variant="secondary" onPress={() => setItem(t("ds.sheet.emptiesTitle"))} />
          <T v="caption" tone="mut">
            {t("ds.sheet.emptiesHint")}
          </T>
        </View>
      </Card>
      <Card>
        <View testID="showcase-sheet-leave">
          <T v="caption" tone="mut">
            {t("ds.sheet.leave", { s: String(motion.durBase / 1000).replace(".", t("ds.decimal")) })}
          </T>
        </View>
      </Card>
      <Sheet visible={selfOpen} onClose={() => { setSelfAsked((n) => n + 1); setSelfOpen(false); }} title={t("ds.sheet.self")}>
        <View testID="showcase-self-body" style={{ gap: space[2] }}>
          <T v="body">{t("ds.sheet.selfBody")}</T>
          <Button testID="showcase-self-yes" label={t("ds.sheet.selfYes")} onPress={() => { setSelfDone((n) => n + 1); setSelfOpen(false); }} />
          <T v="caption">{t("ds.sheet.selfDone", { n: selfDone })}</T>
        </View>
      </Sheet>
      <Sheet visible={open === "chainA"} onClose={close} title={t("ds.sheet.chainA")}>
        <T v="body">{t("ds.sheet.chainBody")}</T>
        <View testID="showcase-chain-next">
          <Button label={t("ds.sheet.chainNext")} onPress={() => setOpen("chainB")} />
        </View>
        <View testID="showcase-chain-next-c">
          <Button label={t("ds.sheet.chainNextC")} variant="secondary" onPress={() => setOpen("chainC")} />
        </View>
      </Sheet>
      <Sheet visible={open === "chainB"} onClose={close} title={t("ds.sheet.chainB")}>
        <T v="body">{t("ds.sheet.chainBodyB")}</T>
      </Sheet>
      {chainC.value ? <ChainSheetC key={chainC.opening} visible={chainC.visible} onExited={chainC.onExited} onClose={close} /> : null}
      <Sheet visible={!!item} onClose={() => setItem(null)} title={item ?? ""}>
        {item ? (
          <>
            <T v="body">{t("ds.sheet.emptiesBody")}</T>
            <T v="body">{t("ds.sheet.emptiesBody2")}</T>
          </>
        ) : null}
      </Sheet>
      <Sheet visible={open === "stuck"} onClose={() => setAsked((n) => n + 1)} title={t("ds.sheet.stuck")}>
        <T v="body">{t("ds.sheet.stuckBody")}</T>
        <View testID="showcase-stuck-asked">
          <T v="caption" tone="mut">
            {t("ds.sheet.stuckAsked", { n: asked })}
          </T>
        </View>
        <View testID="showcase-stuck-done">
          <Button label={t("ds.sheet.stuckDone")} onPress={close} />
        </View>
      </Sheet>
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
      {/* a long list in a sheet: the scroll bar stands in the sheet's side inset, not over the rows' arrows (#1339, DS Б1) */}
      <Sheet visible={open === "list"} onClose={close} title={t("ds.sheet.list")} height="large">
        <SheetScroll testID="showcase-sheet-list-scroll">
          {Array.from({ length: 24 }, (_, i) => (
            <ListRow key={i} title={`${t("ds.sheet.listRow")} ${i + 1}`} right={<Icon name="chevronRight" />} onPress={close} />
          ))}
        </SheetScroll>
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
