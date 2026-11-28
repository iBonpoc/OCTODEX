/**
 * «Линия шагов» (DS §8.15; #3124 В1, spec 71 §16): the steps of one piece of work top to bottom on a thin rail — passed ones with
 * a full status dot and «✓», the current one opened in its own card (the title, the big figure, its line and its StatusPill), the
 * next ones as a hollow ring. A row with somewhere to go presses («›»); `add` closes the line with «＋ Шаг» — a Menu at the row of
 * what can be added (the screen gives the items). Not tied to any object: a job's line today, anything with steps later.
 * Colour only for the status (rule 2): the dot is the status tone of its state and always stands with the word of the row.
 * Only tokens and the parts of src/ui (rules 1, 29).
 */
import { useRef, useState, type ComponentRef } from "react";
import { StyleSheet, View } from "react-native";
import { radius, rhythm, size, space, spaceHalf, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "./primitives";
import { Card } from "./surfaces";
import { Menu, type MenuItem } from "./overlays";
import { StatusPill } from "./statusPill";

export type StepLineState = "done" | "current" | "todo";

export interface StepLineItem {
  key: string;
  title: string;
  /** the quiet line: «12 нояб. · INV-0105» */
  sub?: string;
  /** the step's sum («$1,000.00»): on the right of a row, big in the current card */
  value?: string;
  /** the step's status — icon and word (rule 2); the dot of a passed step takes its tone */
  status?: { status: StatusName; label: string };
  state: StepLineState;
  onPress?: () => void;
  testID?: string;
}

/** the dot's tone by the state: passed — the step's own status (ok by default), current — its status (info by default), next — none */
export const stepDotTone = (s: Pick<StepLineItem, "state" | "status">): StatusName | null =>
  s.state === "todo" ? null : (s.status?.status ?? (s.state === "done" ? "ok" : "info"));

export function StepLine({ items, add, label, testID }: {
  items: StepLineItem[];
  /** «＋ Шаг» at the end: a Menu of what can be added */
  add?: { label: string; items: MenuItem<string>[]; onSelect: (k: string) => void; testID?: string };
  /** what the line is of — read as the list's name («Шаги работы») */
  label: string;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityRole="list" accessibilityLabel={label}>
      {items.map((s, i) => (
        <StepRow key={s.key} s={s} last={i === items.length - 1 && !add} />
      ))}
      {add && add.items.length ? <AddRow add={add} /> : null}
    </View>
  );
}

function Dot({ tone, state }: { tone: StatusName | null; state: StepLineState }) {
  const { c } = useTheme();
  const col = tone ? c.status[tone].text : c.mut;
  return (
    <View
      style={{
        width: size.iconSm,
        height: size.iconSm,
        borderRadius: radius.pill,
        borderWidth: tone ? 0 : size.iconStroke,
        borderColor: col,
        backgroundColor: tone ? col : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state === "done" ? <Icon name="check" s={size.iconXs} color={c.bg} /> : null}
    </View>
  );
}

/** the rail column: the dot and, under it, the line to the next step */
function Rail({ tone, state, last, top }: { tone: StatusName | null; state: StepLineState; last: boolean; top: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size.iconMd, alignItems: "center" }}>
      <View style={{ height: top, width: StyleSheet.hairlineWidth * 2, backgroundColor: c.bd }} />
      <Dot tone={tone} state={state} />
      {last ? null : <View style={{ flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: c.bd }} />}
    </View>
  );
}

function StepRow({ s, last }: { s: StepLineItem; last: boolean }) {
  const { c } = useTheme();
  const tone = stepDotTone(s);
  const a11y = [s.title, s.status?.label, s.value, s.sub].filter(Boolean).join(", ");
  if (s.state === "current") {
    const card = (
      <Card onPress={s.onPress} accessibilityLabel={a11y} style={{ gap: spaceHalf.tight }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <T v="heading" w="bold" style={{ flex: 1 }} numberOfLines={2}>
            {s.title}
          </T>
          {s.status ? <StatusPill status={s.status.status} label={s.status.label} /> : null}
        </View>
        {s.value ? (
          <View testID={s.testID ? `${s.testID}-value` : undefined}>
            <T v="figure" w="bold">
              {s.value}
            </T>
          </View>
        ) : null}
        {s.sub ? (
          <T v="caption" tone="mut">
            {s.sub}
          </T>
        ) : null}
      </Card>
    );
    return (
      <View style={{ flexDirection: "row", gap: space[2] }} accessibilityRole="none">
        <Rail tone={tone} state={s.state} last={last} top={rhythm.cardPad} />
        <View testID={s.testID} style={{ flex: 1, minWidth: 0, paddingVertical: space[1] }}>{card}</View>
      </View>
    );
  }
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: size.rowMin, paddingVertical: space[1] }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="body" w="medium" tone={s.state === "todo" ? "mut" : "ink"} numberOfLines={2}>
          {s.title}
        </T>
        {s.sub ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {s.sub}
          </T>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: spaceHalf.hair }}>
        {s.value ? (
          <View testID={s.testID ? `${s.testID}-value` : undefined}>
            <T v="caption" w="semibold" tone={s.state === "todo" ? "mut" : "ink"}>
              {s.value}
            </T>
          </View>
        ) : null}
        {s.status && s.state === "done" ? <StatusPill status={s.status.status} label={s.status.label} /> : null}
      </View>
      {s.onPress ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <Rail tone={tone} state={s.state} last={last} top={(size.rowMin - size.iconSm) / 2} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {s.onPress ? (
          <Press testID={s.testID} onPress={s.onPress} accessibilityRole="button" accessibilityLabel={a11y}>
            {body}
          </Press>
        ) : (
          <View testID={s.testID} accessible accessibilityLabel={a11y}>
            {body}
          </View>
        )}
      </View>
    </View>
  );
}

function AddRow({ add }: { add: NonNullable<Parameters<typeof StepLine>[0]["add"]> }) {
  const { c } = useTheme();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  return (
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <Rail tone={null} state="todo" last top={(size.rowMin - size.iconSm) / 2} />
      <View ref={ref} collapsable={false} style={{ flex: 1, minWidth: 0 }}>
        <Press
          testID={add.testID}
          accessibilityRole="button"
          accessibilityLabel={add.label}
          onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: size.rowMin, paddingVertical: space[1] }}>
            <Icon name="plus" s={size.iconSm} color={c.ink} />
            <T v="body" w="semibold">
              {add.label}
            </T>
          </View>
        </Press>
        <Menu visible={!!at} anchor={at} items={add.items} onSelect={(k) => { setAt(null); add.onSelect(k); }} onClose={() => setAt(null)} />
      </View>
    </View>
  );
}
