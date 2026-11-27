/**
 * Showcase section «Объект: шапка и действия» of the prototype v2 (BUILD-PLAN §1 поток Б, registered by поток А):
 * ObjectHeader (shut / open by «⌄» or a swipe), ObjectHeaderBar (the compact bar on scroll), IconRow `row` / `inline`,
 * MainStep (in the content; «вторая + главная»; «итог + кнопка»; «контурная» — `main.outline`), SummaryLine, Collapsible; wave 3:
 * the compact bar «‹ Имя ⌄ ⋯», AccessNote (code; held back + pinned), ViewSteps (the visit's steps), IconRow with two-line captions.
 * Names and sums — demo data.
 */
import { useState } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { component, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { NO_UNDO } from "@/data/undo";
import { Button } from "@/ui/controls";
import { AccessNote } from "@/ui/accessNote";
import { Collapsible } from "@/ui/collapsible";
import { IconRow, type IconRowItem } from "@/ui/iconRow";
import { MainStep } from "@/ui/mainStep";
import { ObjectHeader, ObjectHeaderBar } from "@/ui/objectHeader";
import { useToast } from "@/ui/overlays";
import { T } from "@/ui/primitives";
import { SummaryLine } from "@/ui/summaryLine";
import { Card, SectionTitle } from "@/ui/surfaces";
import { MoreButton } from "@/ui/templates/parts";
import { ViewSteps } from "@/ui/viewTabs";
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
  // wave 3 (и): long captions take two lines under the circle, never «…»
  const longRow: IconRowItem[] = [
    act("w-call", "phone", t("ds.proto.call")),
    act("w-remind", "bell", t("ds.proto.remind")),
    act("w-plan", "calendar", t("ds.proto.toPlan")),
    act("w-more", "more", t("ds.proto.more")),
  ];
  const [step, setStep] = useState(1);
  const [sumOn, setSumOn] = useState<"" | "w" | "o">("o");
  const steps = [
    { key: "way", label: t("ds.proto.stWay") },
    { key: "here", label: t("ds.proto.stHere") },
    { key: "work", label: t("ds.proto.stWork") },
    { key: "sign", label: t("ds.proto.stSign") },
    { key: "pay", label: t("ds.proto.stPay") },
  ];
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
          <T v="caption" tone="mut">{t("ds.proto.compactBar")}</T>
          <ObjectHeaderBar
            testID="showcase-object-bar-full"
            title={NAME}
            back={{ label: t("common.back"), onPress: said(t("common.back")) }}
            right={<MoreButton items={[{ key: "archive", label: t("ds.tpl.archive"), icon: "inbox" }]} onMore={(k) => said(k)()} testID="showcase-object-bar-more" />}
            onExpand={said(t("ds.proto.expand"))}
            expandLabel={t("ds.proto.expand")}
          />
          <Button testID="showcase-object-bar-flip" variant="secondary" size="sm" label={compact ? t("ds.proto.compactHide") : t("ds.proto.compactShow")} onPress={flip} />
        </View>
      </Card>
      <IconRow testID="showcase-icon-row" actions={row} />
      <SectionTitle title={t("ds.proto.w3")} />
      <AccessNote testID="showcase-access" label={t("ds.proto.access")} text={t("ds.proto.accessText")} code="#4471" codeWord={t("ds.proto.code")} />
      <AccessNote testID="showcase-access-locked" label={t("ds.proto.access")} text={t("ds.proto.accessText")} code="#4471" codeWord={t("ds.proto.code")} locked={t("ds.proto.codeLocked")} pinned={t("ds.proto.pinnedNote")} />
      <View style={{ gap: space[2] }}>
        <ViewSteps testID="showcase-steps" items={steps} value={step < steps.length ? steps[step]!.key : "done"} label={t("ds.proto.steps")} />
        <Button testID="showcase-steps-next" variant="secondary" size="sm" label={t("ds.proto.stNext")} onPress={() => setStep((n) => (n + 1) % (steps.length + 1))} />
      </View>
      <IconRow testID="showcase-icon-row-long" actions={longRow} />
      <SummaryLine
        testID="showcase-summary-line"
        items={[
          { label: t("ds.proto.jobs"), value: "3", onPress: said(t("ds.proto.jobs")), testID: "showcase-sum-jobs" },
          { label: t("ds.proto.debt"), value: "$1,840.00", status: "bad", testID: "showcase-sum-debt" },
          { label: t("ds.proto.lastVisit"), value: "Nov 12", testID: "showcase-sum-visit" },
        ]}
      />
      {/* Д-факты-2 (#2993): the money total over «Счета» — a part that narrows the list, chosen = the «Заливка» surf2; press — on/off */}
      <SummaryLine
        testID="showcase-summary-filter"
        items={[
          { label: t("proto.money.tile.waiting"), value: "$960.00", onPress: () => setSumOn((x) => (x === "w" ? "" : "w")), selected: sumOn === "w", testID: "showcase-sum-waiting" },
          { label: t("proto.money.tile.overdue"), value: "$1,840.00", status: "bad", onPress: () => setSumOn((x) => (x === "o" ? "" : "o")), selected: sumOn === "o", testID: "showcase-sum-overdue" },
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
      {/* #2381: the editor's bar with edits — «Итого» on the left, «Отменить» (ghost) before «Готово» */}
      <View style={{ gap: space[2] }}>
        <T v="heading">{t("k1.unsaved")}</T>
        <MainStep
          placement="bar"
          main={{ label: t("proto.est.done"), onPress: said(t("proto.est.done")), testID: "showcase-main-done" }}
          total={{ label: t("ue.total"), value: "$772.36", testID: "showcase-main-total" }}
          aside={{ label: t("k1.cancel"), onPress: said(t("k1.cancel")), testID: "showcase-main-aside" }}
        />
      </View>
      <View style={{ gap: space[2] }}>
        <T v="heading">{t("ds.proto.outline")}</T>
        <MainStep placement="bar" main={{ label: t("ds.proto.restore"), onPress: said(t("ds.proto.restore")), outline: true, testID: "showcase-main-outline" }} />
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
