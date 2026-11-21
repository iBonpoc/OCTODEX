/**
 * Showcase section «Объект: шапка и действия» of the prototype v2 (BUILD-PLAN §1 поток Б, registered by поток А):
 * ObjectHeader (shut / open by «⌄» or a swipe), ObjectHeaderBar (the compact bar on scroll), IconRow `row` / `inline`,
 * MainStep (in the content; «вторая + главная»; «итог + кнопка»), SummaryLine, Collapsible. Names and sums — demo data.
 */
import { useState } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { NO_UNDO } from "@/data/undo";
import { Button } from "@/ui/controls";
import { Collapsible } from "@/ui/collapsible";
import { IconRow, type IconRowItem } from "@/ui/iconRow";
import { MainStep } from "@/ui/mainStep";
import { ObjectHeader, ObjectHeaderBar } from "@/ui/objectHeader";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { SummaryLine } from "@/ui/summaryLine";
import { Card, SectionTitle } from "@/ui/surfaces";
import { ProtoTemplates } from "./ProtoTemplates";

/** a demo person of the samples (not a UI word) */
const NAME = "David Kim";

export function ProtoObject() {
  const { t } = useI18n();
  const toast = useToast();
  const said = (x: string) => () => toast.show(t("ds.proto.pressed", { x }), NO_UNDO);
  const [totalOpen, setTotalOpen] = useState(false);
  const scrollY = useSharedValue(0);
  const [compact, setCompact] = useState(false);
  const flip = () => {
    const next = !compact;
    setCompact(next);
    scrollY.value = next ? component.objectHeader.collapseAt * 4 : 0;
  };
  const act = (key: string, icon: IconRowItem["icon"], label: string, extra?: Partial<IconRowItem>): IconRowItem => ({
    icon,
    label,
    a11y: `${label} ${NAME}`,
    onPress: said(label),
    testID: `showcase-qa-${key}`,
    ...extra,
  });
  const row: IconRowItem[] = [
    act("call", "phone", t("ds.proto.call")),
    act("sms", "message", t("ds.proto.sms")),
    act("route", "route", t("ds.proto.route")),
    act("photo", "camera", t("ds.proto.photo"), { disabled: true, reason: t("ds.proto.issueReason") }),
    act("more", "more", t("ds.proto.more")),
  ];
  const inline: IconRowItem[] = [act("in-call", "phone", t("ds.proto.call")), act("in-sms", "message", t("ds.proto.sms"))];
  return (
    <>
    <View style={{ gap: space[6] }} testID="showcase-proto-object">
      <ObjectHeader
        testID="showcase-object-header"
        title={NAME}
        avatar="DK"
        status={{ name: "bad", label: t("ds.proto.owes"), onPress: said(t("ds.proto.owes")) }}
        meta={[{ id: "vip", label: t("ds.proto.vip") }]}
        amount="$1,840.00"
        address={{ text: "1420 Oak St, Austin", onPress: said(t("ds.proto.route")) }}
        actions={inline}
        details={
          <View style={{ gap: space[2] }}>
            <T v="caption" w="semibold" tone="mut">{`${t("ds.proto.contacts")} · 2`}</T>
            <T v="body">{t("ds.proto.detailsText")}</T>
          </View>
        }
        onEdit={said(t("ds.proto.edit"))}
        labels={{ expand: t("ds.proto.expand"), collapse: t("ds.proto.collapse"), more: (n) => t("ds.proto.moreN", { n }), edit: t("ds.proto.edit") }}
      />
      <Card>
        <View style={{ gap: space[2] }}>
          <T v="heading">{t("ds.proto.compact")}</T>
          <ObjectHeaderBar testID="showcase-object-bar" title={NAME} scrollY={scrollY} onExpand={flip} expandLabel={t("ds.proto.expand")} />
          <Button testID="showcase-object-bar-flip" variant="secondary" size="sm" label={compact ? t("ds.proto.compactHide") : t("ds.proto.compactShow")} onPress={flip} />
        </View>
      </Card>
      <IconRow testID="showcase-icon-row" actions={row} />
      <SummaryLine
        testID="showcase-summary-line"
        items={[
          { label: t("ds.proto.jobs"), value: "3", onPress: said(t("ds.proto.jobs")), testID: "showcase-sum-jobs" },
          { label: t("ds.proto.debt"), value: "$1,840.00", status: "bad", testID: "showcase-sum-debt" },
          { label: t("ds.proto.lastVisit"), value: "Nov 12", testID: "showcase-sum-visit" },
        ]}
      />
      <Collapsible testID="showcase-collapsible" title={t("ds.proto.details")}>
        <T v="body">{t("ds.proto.detailsText")}</T>
      </Collapsible>
      <Collapsible testID="showcase-collapsible-count" title={t("ds.proto.done")} count={2} defaultOpen>
        <T v="body" tone="mut">{t("ds.proto.detailsText")}</T>
      </Collapsible>
      <Card>
        <View style={{ gap: space[2] }}>
          <T v="heading">{t("ds.proto.top")}</T>
          <MainStep placement="top" main={{ label: `${t("ds.proto.issue")} · $3,078.00`, onPress: said(t("ds.proto.issue")), reason: t("ds.proto.issueReason"), testID: "showcase-main-top" }} />
        </View>
      </Card>
      <View style={{ gap: space[2] }}>
        <T v="heading">{t("ds.proto.pair")}</T>
        <MainStep
          placement="bar"
          main={{ label: t("ds.proto.sendEst"), onPress: said(t("ds.proto.sendEst")), reason: t("ds.proto.issueReason"), testID: "showcase-main-pair" }}
          second={{ label: t("ds.proto.newEst"), onPress: said(t("ds.proto.newEst")), testID: "showcase-main-second" }}
        />
      </View>
      <View style={{ gap: space[2] }}>
        <T v="heading">{t("ds.proto.totalBar")}</T>
        <MainStep
          placement="bar"
          main={{ label: t("ds.proto.ready"), onPress: said(t("ds.proto.ready")), testID: "showcase-main-total" }}
          total={{ label: t("ds.proto.total"), value: "$772.40", open: totalOpen, onPress: () => setTotalOpen((o) => !o), testID: "showcase-main-total-sum" }}
        />
      </View>
    </View>
    {/* the five screen templates (поток Г) — shown here so the «Прототип v2» screen needs no change of its route */}
    <SectionTitle title={t("ds.sec.protoTemplates")} />
    <ProtoTemplates />
    </>
  );
}
