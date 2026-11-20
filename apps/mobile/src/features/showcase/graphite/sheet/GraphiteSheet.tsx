/**
 * «Графит» — ЛИСТ витрины (#2292, слово основателя 20.11: «я хочу лист… я листаю вниз и проверяю, нажимаю их, переключаю,
 * пользуюсь… вкладки, ссылки, переходить надо — мне неудобно»). ONE page that only scrolls down: sections are headings on the
 * same page; the sticky strip only scrolls this same page to a heading; no tabs, no pages, nothing folds. Every block shows
 * «Как сейчас» and the numbered variants at once, all of them live. Behind the pilot switch (flag.ts); nothing here applies to
 * the app. «Готовятся» — a plain list at the end. Phone 390 first; from 820 the column stays ≤ `sheet.maxWidth`, centred.
 */
import { useRef, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { graphite } from "@octo/design-tokens";
import { size, space } from "@octo/design-tokens";
import { useI18n, type DictKey } from "@/i18n";
import { Button } from "@/ui/controls";
import { T } from "@/ui/primitives";
import { useScreenScroll, type ScreenScroll, type ViewNode } from "@/ui/requiredForm";
import { Card, ListRow, Screen, SectionTitle } from "@/ui/surfaces";
import { GraphiteSection } from "../GraphiteSection";
import { useGrFonts } from "../fonts";
import { GraphiteProvider } from "../theme";
import { ButtonsBlocks } from "./ButtonsBlocks";

interface SheetSection {
  id: string;
  title: DictKey;
  body: ReactNode;
}

/** the sections that are on the sheet now, in the order of the plan (spec 63 §5.3); a section is added by its own PR */
const SECTIONS: SheetSection[] = [
  { id: "buttons", title: "ds.gr.sheet.s.buttons", body: <ButtonsBlocks /> },
  { id: "pilot", title: "ds.gr.sheet.s.pilot", body: <GraphiteSection /> },
];

/** «Готовятся»: not on the sheet yet — a list, not a link */
const SOON: DictKey[] = [
  "ds.gr.sheet.s.fields",
  "ds.gr.sheet.s.select",
  "ds.gr.sheet.s.switch",
  "ds.gr.sheet.s.sheets",
  "ds.gr.sheet.s.notices",
  "ds.gr.sheet.s.nav",
  "ds.gr.sheet.s.lists",
  "ds.gr.sheet.s.rest",
];

/** hands the screen's scroll (it lives inside the screen's content) to the strip */
function GrabScroll({ into }: { into: { current: ScreenScroll | null } }) {
  into.current = useScreenScroll();
  return null;
}

export function GraphiteSheet({ title, caption, onBack }: { title: string; caption: string; onBack: () => void }) {
  const { t } = useI18n();
  const loaded = useGrFonts();
  const scroll = useRef<ScreenScroll | null>(null);
  const anchors = useRef<Record<string, ViewNode | null>>({});
  const jump = (id: string) => {
    const node = anchors.current[id];
    // the heading stops under the sticky strip
    if (node) scroll.current?.scrollToNode(node, size.hitMin + space[4], true);
  };
  const column = { width: "100%" as const, maxWidth: graphite.sheet.maxWidth, alignSelf: "center" as const, gap: space[3] };
  const strip = (
    <View testID="gr-sheet-strip" style={{ width: "100%", maxWidth: graphite.sheet.maxWidth, alignSelf: "center" }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityLabel={t("ds.gr.sheet.jump")}>
        {SECTIONS.map((s) => (
          <Button key={s.id} testID={`gr-jump-${s.id}`} size="sm" variant="secondary" label={t(s.title)} onPress={() => jump(s.id)} />
        ))}
        <Button testID="gr-jump-soon" size="sm" variant="secondary" label={t("ds.gr.sheet.soon")} onPress={() => jump("soon")} />
      </ScrollView>
    </View>
  );
  const heading = (id: string, text: string) => (
    <View key={id} testID={`gr-section-${id}`} collapsable={false} ref={(n) => void (anchors.current[id] = n)}>
      <SectionTitle title={text} />
    </View>
  );
  return (
    <GraphiteProvider>
      <Screen title={title} back={onBack} tabs={strip} tabKey="gr-sheet" below={
        <View testID="gr-sheet-page" style={column}>
          {loaded
            ? SECTIONS.map((s) => (
                <View key={s.id} style={{ gap: space[3] }}>
                  {heading(s.id, t(s.title))}
                  {s.body}
                </View>
              ))
            : null}
          {heading("soon", t("ds.gr.sheet.soon"))}
          <Card>
            <View testID="gr-soon">
              <T v="caption" tone="mut">
                {t("ds.gr.sheet.soonHint")}
              </T>
              {SOON.map((k) => (
                <ListRow key={k} title={t(k)} chevron={false} />
              ))}
            </View>
          </Card>
        </View>
      }>
        <GrabScroll into={scroll} />
        <View testID="showcase-screen-graphite" style={{ gap: space[1] }}>
          <T v="caption" tone="mut">{caption}</T>
          <T v="body">{t("ds.gr.sheet.intro")}</T>
        </View>
      </Screen>
    </GraphiteProvider>
  );
}
