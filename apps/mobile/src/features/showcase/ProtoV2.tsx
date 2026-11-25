/**
 * Showcase section «Визуальный язык v2» (docs/design/visual-v2.html «Визуальный язык числами», founder 21.11): the layers (a card
 * `surf` with its top highlight → a cell `surf2` → the chosen `surf3`), the button pair (the filled yellow + the dark one with yellow
 * words + a round icon 40), the round buttons 40 / 32 / 44 with a caption, the segment 36 (neutral and the one yellow), the progress in
 * words, the checklist, the timer, the three figures, the tiles 2 and 3 in a row (one yellow), the rows «цифры справа», the time and the
 * interval (the nearest in the accent's tone). The names and sums are demo data, the words come from i18n.
 */
import { useState } from "react";
import { todayKey, type DayKey } from "@/features/calendar";
import { View } from "react-native";
import { radius, rhythm, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { CheckList, type CheckItem } from "@/ui/checkList";
import { IconButton, ProgressBar, Segmented } from "@/ui/controls";
import { TextField } from "@/ui/controls";
import { MonthArrows, MonthPick, useMonthHead } from "@/ui/dayStrip";
import { CountPill, FigureRow, HatchPlate, IntervalPlate, NumberTrio, ProgressWords, TimeSlot, TimerLine, TonePill } from "@/ui/figures";
import { GroupHairline, GroupHead, GroupRowBody, ListGroup, useGroupEdge } from "@/ui/groupedList";
import { NowCard } from "@/ui/nowCard";
import { FitTitle, HeadStatus } from "@/ui/templates/screenHeader";
import { ViewTabs } from "@/ui/viewTabs";
import { IconRow } from "@/ui/iconRow";
import { ButtonPair } from "@/ui/pairs";
import { T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";
import { StatGrid, StatTile } from "@/ui/statTile";
import { useToast } from "@/ui/overlays";
import { NO_UNDO } from "@/data/undo";

export function ProtoV2() {
  const { t, duration } = useI18n();
  const { c } = useTheme();
  const toast = useToast();
  const said = (label: string) => () => toast.show(label, NO_UNDO);
  const [mode, setMode] = useState("day");
  const [section, setSection] = useState("all");
  const [title, setTitle] = useState("Bathroom remodel");
  const [sum, setSum] = useState("1,840");
  const [day, setDay] = useState<DayKey>(todayKey());
  const head = useMonthHead(day, setDay);
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
        {/* v2 макеты 3–4: progress in words, the trio without cells, the warm access pill */}
        <ProgressWords testID="showcase-v2-words" caption={t("px2.cv.workCap")} value={t("px2.cv.ofPct", { n: 3, m: 5, p: 60 })} />
        <NumberTrio testID="showcase-v2-trio-plain" look="plain" items={[{ value: "$3,420", label: t("px2.cv.estimate") }, { value: "$342", label: t("px2.cv.deposit") }, { value: "$3,078", label: t("px2.cv.work") }]} />
        <TonePill testID="showcase-v2-tone-pill" tone="warn" icon="key" label={t("px2.cv.code", { code: "4512" })} />
        <ButtonPair
          main={{ label: t("ds.v2.finish"), icon: "check", onPress: said(t("ds.v2.finish")) }}
          second={{ label: t("ds.proto.photo"), icon: "camera", onPress: said(t("ds.proto.photo")) }}
          icon={{ icon: "note", a11y: t("ds.proto.edit"), onPress: said(t("ds.proto.edit")), testID: "showcase-v2-pair2-icon" }}
        />
      </Card>
      {/* the tiles: two in a row (one yellow) and three in a row */}
      <StatGrid testID="showcase-v2-tiles">
        <StatTile icon="invoice" label={t("ds.v2.owed")} value="$4,120" sub={t("ds.v2.days", { n: 9 })} testID="showcase-v2-tile-owed" />
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
        {/* №5 «Смета, редактор»: the client card with the pastel initials, «Позиции  7» with its count */}
        <FigureRow testID="showcase-v2-row-client" avatar={{ initials: "LA", name: "Linda Alvarez" }} title="Linda Alvarez" line="2207 Ocean Park Blvd, Santa Monica" onPress={said("Linda Alvarez")} />
        <RowView>
          <T v="heading">{t("ue.items")}</T>
          <CountPill n={7} testID="showcase-v2-count" />
        </RowView>
      </View>
      {/* the time and the interval: the nearest in the accent's tone, not a fill */}
      <View style={{ gap: rhythm.cardGap }}>
        <TimeSlot testID="showcase-v2-slot-late" hour="7:30" length={t("ds.v2.hours", { n: 2 })} from="7:30" to="9:30" title="James O'Connor" line="Panel upgrade 200A" status={{ status: "bad", label: t("st.late") }} onPress={said("James O'Connor")} />
        <TimeSlot testID="showcase-v2-slot-near" top={<HatchPlate label={t("px1.plan.road", { d: duration(12) })} />} oneLine hour="8:30" length={t("ds.v2.hours", { n: 4 })} near from="8:30" to="12:30" title="Sarah Mitchell" line="Bathroom remodel · Alex" onPress={said("Sarah Mitchell")} />
      </View>
      {/* the last pass of v2 (#2350, SCREEN-SPECS.md): every new variant once, as the six screens use it */}
      <ViewTabs look="chips" testID="showcase-v2-chips-tabs" label={t("ds.v2.work")} value={section} onChange={setSection} items={[{ key: "all", label: t("cat.all") }, { key: "est", label: t("nav.estimates"), count: 1 }, { key: "inv", label: t("nav.invoices"), count: 2 }]} />
      <NowCard
        testID="showcase-v2-now-big"
        big
        kicker={t("ds.tpl.next")}
        soon={t("ds.tpl.in10")}
        window="8:30–12:30 PM"
        title="David Kim"
        sub="Kitchen faucet · 4512 Ventura Blvd"
        progress={{ caption: t("ds.v2.work"), value: 0, max: 4, label: t("ds.v2.ofN", { a: 0, b: 4 }) }}
        trio={[{ value: t("ds.v2.hours", { n: 2 }), label: t("ds.v2.onSite") }, { value: "$1,840", label: t("ds.v2.sum") }, { value: "Alex", label: t("ds.v2.tech") }]}
        main={{ label: t("ds.v2.enRoute"), onPress: said(t("ds.v2.enRoute")), testID: "showcase-v2-now-big-main" }}
        mainIcon="check"
        second={{ label: t("ds.proto.route"), icon: "route", onPress: said(t("ds.proto.route")), testID: "showcase-v2-now-big-second" }}
        icon={{ icon: "phone", a11y: t("ds.proto.call"), onPress: said(t("ds.proto.call")), testID: "showcase-v2-now-big-call" }}
      />
      <NowCard
        testID="showcase-v2-now-bare"
        bare
        kicker={t("tday.now")}
        title="Bathroom remodel"
        status={{ status: "ok", label: t("st.sent") }}
        words={{ caption: t("px2.cv.workCap"), value: t("px2.cv.ofPct", { n: 3, m: 5, p: 60 }) }}
        trio={[{ value: "$3,420", label: t("px2.cv.estimate") }, { value: "$342", label: t("px2.cv.deposit") }, { value: "$3,078", label: t("px2.cv.work") }]}
        trioLook="plain"
        onPress={said("Bathroom remodel")}
      />
      <ListGroup bare title={t("ds.tpl.attention")} all={{ label: t("ds.tpl.all"), onPress: said(t("ds.tpl.all")) }} testID="showcase-v2-group-bare">
        <StatGrid>
          <StatTile dense icon="invoice" label={t("ds.v2.owed")} value="$2,800" unit={t("ds.v2.days", { n: -9 })} unitTone="bad" testID="showcase-v2-tile-dense" />
          <StatTile dense icon="wallet" label={t("st.paid")} value="$1,020" unit={t("ds.v2.days", { n: 0 })} testID="showcase-v2-tile-dense2" />
          <StatTile icon="dollar" label={t("st.paid")} value="$2,800" sub="2" subNote={{ tone: "bad", text: t("st.overdue") }} testID="showcase-v2-tile-subnote" />
        </StatGrid>
      </ListGroup>
      <ListGroup count={2} title={t("st.paid")} testID="showcase-v2-group-note">
        <FigureRow testID="showcase-v2-row-ok" icon="check" iconTone="ok" title="Linda Alvarez" line="INV-0102" cols={[{ label: t("ds.v2.sum"), value: "$412.60" }]} />
      </ListGroup>
      <ShowEstimateGroup />
      <FigureRow testID="showcase-v2-row-warm" tone="warn" icon="key" title={t("px2.cv.code", { code: "4512" })} line={t("ds.v2.work")} />
      <StatGrid cols={4} testID="showcase-v2-tiles4">
        <StatTile icon="calendar" label={t("ds.v2.jobs")} value={7} testID="showcase-v2-t4-a" />
        <StatTile icon="clock" label={t("ds.v2.work")} value={12} unit={t("ds.v2.h")} testID="showcase-v2-t4-b" />
        <StatTile icon="check" label={t("st.paid")} value={3} testID="showcase-v2-t4-c" />
        <StatTile icon="invoice" label={t("ds.v2.owed")} value="$4,120" testID="showcase-v2-t4-d" />
      </StatGrid>
      <RowView gap={rhythm.cardGap}>
        <IntervalPlate from="8:30" to="12:30" />
        <IntervalPlate from="8:30" to="12:30" near />
        <IntervalPlate from={t("ds.v2.work")} to="" />
      </RowView>
      <Card>
        <FitTitle text="Sarah Mitchell-Rodriguez Residence" />
        <HeadStatus status="info" label={t("st.sent")} onPress={said(t("st.sent"))} testID="showcase-v2-head-status" />
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="heading">{head.title}</T>
          <MonthArrows head={head} testID="showcase-v2-month" />
        </RowView>
        <IconButton icon="calendar" label={head.label} onPress={head.toggle} testID="showcase-v2-month-toggle" />
        <MonthPick head={head} date={day} onPick={setDay} testID="showcase-v2-month" />
      </Card>
      <TextField plate type="title" value={title} onChangeText={setTitle} label={t("ue.items")} testID="showcase-v2-field-plate" />
      <TextField big type="money" prefix="$" value={sum} onChangeText={setSum} label={t("ds.v2.sum")} testID="showcase-v2-field-big" />
    </View>
  );
}

/** #2387: an estimate's group as the screen draws it — GroupHead with «˅», the kind, the count, the sum and a quiet «⋯»; two rows drawn
 *  one by one (GroupRowBody inside the group edge, an inset GroupHairline between them) — one card, as every ListGroup */
function ShowEstimateGroup() {
  const { t } = useI18n();
  const edge = useGroupEdge();
  const [open, setOpen] = useState(true);
  return (
    <View testID="showcase-v2-estimate-group" style={{ gap: rhythm.headGap }}>
      {/* DS §8.2а (wave 1 п.6): the four ways to add, two by two — no «˅» menu */}
      <View style={{ gap: space[2] }}>
        <ButtonPair main={{ label: t("est.row.addShort"), icon: "plus", variant: "secondary", onPress: () => undefined }} second={{ label: t("est2.add.section"), icon: "plus", variant: "secondary", onPress: () => undefined }} />
        <ButtonPair main={{ label: t("cat.title"), icon: "catalog", variant: "secondary", onPress: () => undefined }} second={{ label: t("px3.est.template"), icon: "template", variant: "secondary", onPress: () => undefined }} />
      </View>
      <GroupHead title={t("est.sec.material")} icon="box" count={2} value="$152.84" fold={{ open, onToggle: () => setOpen(!open), label: t("est.sec.toggle") }} actions={<IconButton bare icon="more" label={t("est.sec.menu")} />} />
      {open ? (
        <View>
          <View style={edge(true, false)}>
            <GroupRowBody title="Railing bracket" subtitle="12 ea × $12.13" value="$145.56" />
          </View>
          <View style={edge(false, true)}>
            <GroupHairline />
            <GroupRowBody title="LED bulb A19" subtitle="1 ea" value="$7.28" />
          </View>
        </View>
      ) : null}
    </View>
  );
}
