/**
 * Showcase section «Визуальный язык v2» (docs/design/visual-v2.html «Визуальный язык числами», founder 21.11): the layers (a card
 * `surf` with its top highlight → a cell `surf2` → the chosen `surf3`), the button pair (the filled yellow + the dark one with yellow
 * words + a round icon 40), the round buttons 40 / 32 / 44 with a caption, the segment 36 (neutral and the one yellow), the progress in
 * words, the checklist, the timer, the three figures, the tiles 2 and 3 in a row (one yellow), the rows «цифры справа», the time and the
 * interval (the nearest in the accent's tone). The names and sums are demo data, the words come from i18n.
 */
import { useState } from "react";
import { View } from "react-native";
import { radius, rhythm, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { CheckList, type CheckItem } from "@/ui/checkList";
import { IconButton, ProgressBar, Segmented } from "@/ui/controls";
import { FigureRow, NumberTrio, TimeSlot, TimerLine } from "@/ui/figures";
import { IconRow } from "@/ui/iconRow";
import { ButtonPair } from "@/ui/pairs";
import { T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
import { StatGrid, StatTile } from "@/ui/statTile";
import { useToast } from "@/ui/overlays";
import { NO_UNDO } from "@/data/undo";

export function ProtoV2() {
  const { t } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const said = (label: string) => () => toast.show(label, NO_UNDO);
  const [mode, setMode] = useState("day");
  const [kind, setKind] = useState("a");
  const [items, setItems] = useState<CheckItem[]>([
    { key: "1", label: t("ds.v2.check1"), done: true },
    { key: "2", label: t("ds.v2.check2"), done: false },
    { key: "3", label: t("ds.v2.check3"), done: false },
  ]);
  return (
    <View style={{ gap: rhythm.blockGap }} testID="showcase-proto-v2">
      {/* the layers: the card, a cell in it, the chosen cell */}
      <Card>
        <T v="heading">{t("ds.v2.work")}</T>
        <RowView gap={rhythm.cardGap}>
          <View style={{ flex: 1, height: space[8], borderRadius: radius.inner, backgroundColor: c.surf2 }} />
          <View style={{ flex: 1, height: space[8], borderRadius: radius.inner, backgroundColor: c.surf3 }} />
        </RowView>
        <ProgressBar caption={t("ds.v2.work")} value={3} max={5} label={t("ds.v2.ofN", { a: 3, b: 5 })} />
        <ButtonPair
          testID="showcase-v2-pair"
          main={{ label: t("ds.v2.enRoute"), icon: "check", onPress: said(t("ds.v2.enRoute")) }}
          second={{ label: t("ds.proto.route"), icon: "route", onPress: said(t("ds.proto.route")) }}
          icon={{ icon: "phone", a11y: t("ds.proto.call"), onPress: said(t("ds.proto.call")), testID: "showcase-v2-pair-icon" }}
        />
      </Card>
      {/* the round buttons: 40, 32 inside a card, 44 with a caption */}
      <Card>
        <RowView gap={rhythm.cardGap}>
          <IconButton icon="plus" label={t("ds.proto.edit")} onPress={said("40")} testID="showcase-v2-round40" />
          <IconButton icon="chevronUp" size="card" label={t("ds.v2.timerFold")} onPress={said("32")} testID="showcase-v2-round32" />
        </RowView>
        <IconRow
          testID="showcase-v2-quick"
          actions={[
            { icon: "phone", a11y: t("ds.proto.call"), label: t("ds.proto.call"), onPress: said(t("ds.proto.call")), testID: "showcase-v2-q-call" },
            { icon: "message", a11y: t("ds.proto.sms"), label: t("ds.proto.sms"), onPress: said(t("ds.proto.sms")), testID: "showcase-v2-q-sms" },
            { icon: "route", a11y: t("ds.proto.route"), label: t("ds.proto.route"), onPress: said(t("ds.proto.route")), testID: "showcase-v2-q-route" },
            { icon: "camera", a11y: t("ds.proto.photo"), label: t("ds.proto.photo"), onPress: said(t("ds.proto.photo")), testID: "showcase-v2-q-photo" },
          ]}
        />
      </Card>
      {/* the segment: the Plan's one yellow; a form's choice — the neutral chosen cell */}
      <Segmented accent full testID="showcase-v2-seg-accent" value={mode} onChange={setMode} items={[{ key: "day", label: t("plan.day") }, { key: "week", label: t("plan.week") }, { key: "month", label: t("plan.month") }]} />
      <Segmented full testID="showcase-v2-seg" value={kind} onChange={setKind} items={[{ key: "a", label: t("ds.v2.work") }, { key: "b", label: t("ds.v2.jobs") }]} />
      {/* the visit: the checklist, the timer, the three figures, the pair «Завершить · Фото · ✎» */}
      <Card>
        <CheckList testID="showcase-v2-check" items={items} onToggle={(k, d) => setItems((xs) => xs.map((x) => (x.key === k ? { ...x, done: d } : x)))} />
        <TimerLine testID="showcase-v2-timer" value="1:12:40" since={t("ds.v2.since", { t: "8:34" })} action={{ icon: "chevronUp", a11y: t("ds.v2.timerFold"), onPress: said(t("ds.v2.timerFold")), testID: "showcase-v2-timer-fold" }} />
        <NumberTrio testID="showcase-v2-trio" items={[{ value: t("ds.v2.hours", { n: 4 }), label: t("ds.v2.onSite") }, { value: t("ds.v2.min", { n: 12 }), label: t("ds.v2.onRoad") }, { value: "Alex", label: t("ds.v2.tech") }]} />
        <ButtonPair
          main={{ label: t("ds.v2.finish"), icon: "check", onPress: said(t("ds.v2.finish")) }}
          second={{ label: t("ds.proto.photo"), icon: "camera", onPress: said(t("ds.proto.photo")) }}
          icon={{ icon: "note", a11y: t("ds.proto.edit"), onPress: said(t("ds.proto.edit")), testID: "showcase-v2-pair2-icon" }}
        />
      </Card>
      {/* the tiles: two in a row (one yellow) and three in a row */}
      <StatGrid testID="showcase-v2-tiles">
        <StatTile icon="invoice" accent label={t("ds.v2.owed")} value="$4,120" sub={t("ds.v2.days", { n: 9 })} testID="showcase-v2-tile-owed" />
        <StatTile icon="wallet" label={t("st.paid")} value="$1,240" testID="showcase-v2-tile-paid" />
      </StatGrid>
      <StatGrid cols={3} testID="showcase-v2-tiles3">
        <StatTile icon="calendar" label={t("ds.v2.jobs")} value={7} testID="showcase-v2-t3-a" />
        <StatTile icon="clock" label={t("ds.v2.work")} value={12} unit={t("ds.v2.h")} testID="showcase-v2-t3-b" />
        <StatTile icon="check" label={t("st.paid")} value={3} testID="showcase-v2-t3-c" />
      </StatGrid>
      {/* the rows «цифры справа» */}
      <View style={{ gap: rhythm.cardGap }}>
        <FigureRow testID="showcase-v2-row-late" icon="doc" title="David Kim" line="INV-0101 · Kitchen faucet" cols={[{ label: t("ds.v2.due"), value: t("ds.v2.days", { n: -9 }), tone: "bad" }, { label: t("ds.v2.sum"), value: "$1,840" }]} onPress={said("David Kim")} />
        <FigureRow testID="showcase-v2-row-soon" icon="calendar" title="8:30–12:30" line="Bathroom remodel · Alex" status={{ status: "info", label: t("st.sent") }} />
      </View>
      {/* the time and the interval: the nearest in the accent's tone, not a fill */}
      <View style={{ gap: rhythm.cardGap }}>
        <TimeSlot testID="showcase-v2-slot-late" hour="7:30" length={t("ds.v2.hours", { n: 2 })} from="7:30" to="9:30" title="James O'Connor" line="Panel upgrade 200A" status={{ status: "bad", label: t("st.late") }} onPress={said("James O'Connor")} />
        <TimeSlot testID="showcase-v2-slot-near" hour="8:30" length={t("ds.v2.hours", { n: 4 })} near from="8:30" to="12:30" title="Sarah Mitchell" line="Bathroom remodel · Alex" onPress={said("Sarah Mitchell")} />
      </View>
    </View>
  );
}
