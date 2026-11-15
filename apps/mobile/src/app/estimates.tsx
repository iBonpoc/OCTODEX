import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useI18n } from "@/i18n";
import { EstimatesBoard } from "@/features/boards";
import { IconButton } from "@/ui/controls";
import { Menu } from "@/ui/overlays";
import { Screen } from "@/ui/surfaces";

/** «Сметы»: all estimates, a section of its own for every role (founder 07.11, spec 31 §7а). */
export default function Estimates() {
  const { t } = useI18n();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));
  // «＋»: a menu at the button — «Новая смета», «Из шаблона…» (DS §8.13, #1117)
  const [menu, setMenu] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const add = (
    <View ref={ref} collapsable={false} testID="est-list-add">
      {/* «＋» opens a choice (DS §8.13): the label names the choice, not one of its items (design review) */}
      <IconButton icon="plus" label={t("est.tplIn.create")} onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setMenu({ x, y, w, h }))} />
    </View>
  );
  return (
    <>
      <EstimatesBoard
        wrap={(body, aside) => (
          <Screen title={t("sales.estimates")} back={back} aside={aside} right={add}>
            {body}
          </Screen>
        )}
      />
      <Menu
        visible={!!menu}
        anchor={menu}
        items={[
          { key: "blank" as const, label: t("est.new"), icon: "plus" as const, testID: "est-list-add-blank" },
          { key: "template" as const, label: t("est.tplIn.from"), icon: "doc" as const, testID: "est-list-add-template" },
        ]}
        onSelect={(k) => {
          setMenu(null);
          router.push(k === "template" ? "/estimate/new?pick=templates" : "/estimate/new");
        }}
        onClose={() => setMenu(null)}
      />
    </>
  );
}
