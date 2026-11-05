/**
 * List card (docs/specs/06-list-cards.md): one card for every object in every list.
 * Header (lead · title + when · value) → chips (status, signs, trade, tags) → fact lines in the one order
 * → figure tiles → progress → contact buttons + main action. Text wraps, never "…"; a fact fades after 3 lines.
 * Density: compact (pickers, "other at this client"), regular (≤ 4 lines), rich (all), row (desktop 1280).
 * Touch targets: 44 pt on iOS/web (App Store), 48 dp on Android (Google Play). Tokens only.
 * Layout rules are pure functions in ./listCardLayout (unit-tested); this file only draws them.
 */
import { useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native"; // ds-allow: src/ui primitive
import { useReducedMotion } from "react-native-reanimated";
import { component, font, layout, radius, size, space, spaceHalf, statusIcon, motion, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useI18n } from "@/i18n";
import { Icon, Press, type IconKey } from "./primitives";
import { Sheet } from "./overlays";
import {
  FACT_ICON, FACT_MAX_LINES, contactActions, edgeTone, layoutFacts, rowColumns, touchPad,
  type Contact, type ContactAction, type Density, type FactKey, type Facts, type OS,
} from "./listCardLayout";

const HIT = { ios: size.hitMin, android: size.hitMinAndroid };
/** fact icons stand under the centre of the lead (36; the time block is 44) */
const leadWidth = (lead: CardLead) => (lead.kind === "time" ? size.hitMin : component.avatar.md);
const pad = (visible: number) => {
  const p = touchPad(visible, Platform.OS as OS, HIT);
  return { top: p, bottom: p, left: p, right: p };
};

/* ---------- text with the snug line height; wraps, clipped (not "…") after N lines ---------- */
type Variant = keyof typeof font.size;
function Txt({ v = "body", w = "regular", color, lines, style, children, tabular }: {
  v?: Variant; w?: keyof typeof font.families; color: string; lines?: number; style?: StyleProp<TextStyle>; children: ReactNode; tabular?: boolean;
}) {
  const lh = Math.round(font.size[v] * font.lineHeight.snug);
  const text = (
    <Text style={[{ fontFamily: font.families[w], fontSize: font.size[v], lineHeight: lh, color, fontVariant: tabular ? ["tabular-nums"] : undefined }, style]}>
      {children}
    </Text>
  );
  // clipped by height, never "…" (founder): the rest is in the opened card
  return lines ? <View style={{ maxHeight: lh * lines, overflow: "hidden" }}>{text}</View> : text;
}

/* ---------- small tap target: visible size stays, touch area grows to 44 / 48 ---------- */
function Tap({ visible, onPress, label, children, style, role = "button" }: {
  visible: number; onPress: () => void; label: string; children: ReactNode; style?: StyleProp<ViewStyle>; role?: "button" | "radio";
}) {
  const reduce = useReducedMotion();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={pad(visible)}
      accessibilityRole={role}
      accessibilityLabel={label}
      style={({ pressed }) => [style, pressed && !reduce ? { transform: [{ scale: motion.pressScale }] } : null]}
    >
      {children}
    </Pressable>
  );
}

/* ---------- leading element ---------- */
export type CardLead =
  | { kind: "initials"; text: string; dashed?: boolean }
  | { kind: "icon"; icon: IconKey; tone?: StatusName }
  | { kind: "time"; top: string; bottom: string }
  | { kind: "check"; on: boolean; onToggle: () => void; label: string };

function Lead({ lead, small }: { lead: CardLead; small: boolean }) {
  const { c } = useTheme();
  const s = small ? component.avatar.sm : component.avatar.md;
  const round: ViewStyle = { width: s, height: s, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" };
  switch (lead.kind) {
    case "initials":
      return (
        <View style={[round, lead.dashed ? { borderStyle: "dashed" } : null]}>
          <Txt v={small ? "micro" : "caption"} w="semibold" color={c.ink}>{lead.text}</Txt>
        </View>
      );
    case "icon":
      return (
        <View style={round}>
          <Icon name={lead.icon} s={small ? size.iconSm : size.iconMd} color={lead.tone && lead.tone !== "neutral" ? c.status[lead.tone].text : c.ink} />
        </View>
      );
    case "time":
      return (
        <View style={{ width: size.hitMin, paddingVertical: space[1], borderRadius: radius.field, backgroundColor: c.in, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center" }}>
          <Txt v="caption" w="semibold" color={c.ink} tabular>{lead.top}</Txt>
          <Txt v="caption" w="semibold" color={c.mut}>{lead.bottom}</Txt>
        </View>
      );
    case "check": {
      const b = component.checkbox;
      return (
        <View style={{ width: s, alignItems: "center" }}>
          <Tap visible={b.size} onPress={lead.onToggle} label={lead.label} role="button">
            <View style={{ width: b.size, height: b.size, borderRadius: b.radius, borderWidth: b.border, borderColor: lead.on ? c.status.ok.fill : c.mut, backgroundColor: lead.on ? c.status.ok.fill : undefined, alignItems: "center", justifyContent: "center" }}>
              {lead.on ? <Icon name="check" s={size.iconSm} color={c.status.ok.on} /> : null}
            </View>
          </Tap>
        </View>
      );
    }
  }
}

/* ---------- chips: status (tappable when it can change), signs, trade, tags ---------- */
export interface CardStatus {
  tone: StatusName;
  label: string;
  /** the status can be changed by hand from the card (statusMoves): shows a chevron and opens the picker */
  onPress?: () => void;
}
export interface CardSign {
  tone: "warn" | "bad";
  label: string;
}

function Chip({ tone, label, soft, onPress, a11y }: { tone: StatusName; label: string; soft?: boolean; onPress?: () => void; a11y?: string }) {
  const { c } = useTheme();
  const st = c.status[tone];
  const neutral = tone === "neutral";
  const fg = soft || neutral ? (neutral ? c.ink : st.text) : st.on;
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], height: component.chip.h, paddingHorizontal: component.chip.px, borderRadius: radius.chip, backgroundColor: soft ? undefined : neutral ? c.surf2 : st.fill, borderWidth: component.hairline, borderColor: soft || neutral ? c.bd : st.fill }}>
      <Icon name={statusIcon[tone]} s={size.iconSm} color={fg} />
      <Txt v="caption" w="semibold" color={fg}>{label}</Txt>
      {onPress ? <Icon name="chevronDown" s={size.iconXs} color={fg} /> : null}
    </View>
  );
  if (!onPress) return <View accessibilityRole="text" accessibilityLabel={label}>{body}</View>;
  return <Tap visible={component.chip.h} onPress={onPress} label={a11y ?? label}>{body}</Tap>;
}

function Tag({ label, icon }: { label: string; icon?: IconKey }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1], height: component.chip.h, paddingHorizontal: component.chip.px, borderRadius: radius.chip, borderWidth: component.hairline, borderColor: c.bd }}>
      {icon ? <Icon name={icon} s={size.iconXs} color={c.mut} /> : null}
      <Txt v="caption" w="medium" color={icon ? c.ink : c.mut}>{label}</Txt>
    </View>
  );
}

/* ---------- figures ---------- */
export interface CardFigure {
  label: string;
  value: string;
  /** colour only for a status, always with its icon */
  tone?: StatusName;
}

/* ---------- props ---------- */
export interface ListCardProps {
  title: string;
  /** "3 min ago", "since Nov 2026" — under the title; goes to the right when there is no value */
  when?: string;
  lead: CardLead;
  value?: string;
  valueLabel?: string;
  /** "+" payment in green-text (status ok) */
  valueTone?: StatusName;
  status?: CardStatus;
  signs?: CardSign[];
  /** business line (only where the entity has the field) */
  trade?: string;
  tags?: string[];
  facts?: Facts;
  figures?: CardFigure[];
  progress?: { value: number; max: number; label?: string };
  contact?: Contact;
  action?: { label: string; onPress: () => void; /** icon of the action on a desktop row (default: send) */ icon?: IconKey };
  density?: Density;
  /** desktop row: which facts become columns */
  columns?: readonly FactKey[];
  selected?: boolean;
  onPress?: () => void;
  /** offline: change waits in the queue */
  queued?: boolean;
  testID?: string;
  /**
   * The ONLY way a card changes data (spec 06): a contact button is handed to the screen instead of being opened here,
   * so the screen records it with existing store functions (lead: touchLead / call result) and opens the url itself (openContact).
   */
  onContact?: (a: ContactAction) => void;
  /**
   * reasons of a «people» card (attention): each row — tone icon + text (+ a grey detail), opens its own record;
   * an optional verb action (secondary, small) — never «open», the row itself opens
   */
  reasons?: { key: string; tone: StatusName; text: string; detail?: string; onPress?: () => void; action?: { label: string; onPress: () => void } }[];
  /** override the edge: by default the worst of status and signs; a list may say «only what needs action» (null = no edge) */
  edge?: "warn" | "bad" | null;
}

/** open a contact action's url (call, SMS, map, email) */
export const openContact = (a: ContactAction) => void Linking.openURL(a.url).catch(() => undefined);

export function ListCard(p: ListCardProps) {
  const { c } = useTheme();
  const { t } = useI18n();
  const { device } = useDevice();
  const wanted = p.density ?? "rich";
  if (wanted === "row" && device === "desktop") return <ListCardRow {...p} />;
  // a desktop row on a narrower screen becomes a regular card
  const density: Density = wanted === "row" ? "regular" : wanted;
  const LEAD_INSET = (leadWidth(p.lead) - size.iconSm) / 2;
  const compact = density === "compact";
  const actions = compact ? [] : contactActions(p.contact ?? {}, Platform.OS as OS);
  const lines = layoutFacts(p.facts ?? {}, density, device);
  const edge = p.edge !== undefined ? p.edge : edgeTone([p.status?.tone, ...(p.signs ?? []).map((s) => s.tone)]);
  const btn = device === "phone" ? component.button.phone : component.button.md;
  const open = (a: ContactAction) => () => (p.onContact ? p.onContact(a) : openContact(a));
  const a11yActions = actions.map((a) => ({ name: a.kind, label: t(`card.act.${a.kind}`, { v: a.value }) }));

  /** a single fact and the first of a pair sit under the centre of the lead; the second of a pair starts after the same gap */
  const fact = (k: FactKey, pos: "single" | "first" | "second") => (
    <View key={k} style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start", flex: pos === "single" ? undefined : 1, minWidth: 0, paddingLeft: pos === "second" ? 0 : LEAD_INSET }}>
      <View style={{ paddingTop: spaceHalf.hair }} accessibilityElementsHidden importantForAccessibility="no">
        <Icon name={FACT_ICON[k]} s={size.iconSm} color={c.mut} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${t(`card.fact.${k}`)}: ${p.facts?.[k] ?? ""}`}>
        <Txt color={k === "desc" ? c.mut : c.ink} v={k === "desc" ? "caption" : "body"} lines={FACT_MAX_LINES}>{p.facts?.[k]}</Txt>
      </View>
    </View>
  );

  const valueText = p.value ? (
    <View style={{ alignItems: "flex-end", gap: spaceHalf.hair }}>
      <Txt v="heading" w="semibold" color={p.valueTone && p.valueTone !== "neutral" ? c.status[p.valueTone].text : c.ink} tabular>{p.value}</Txt>
      {p.valueLabel ? <Txt v="caption" w="semibold" color={c.mut}>{p.valueLabel}</Txt> : null}
    </View>
  ) : p.when ? (
    <Txt v="caption" color={c.mut}>{p.when}</Txt>
  ) : null;

  const chips = [
    p.status ? <Chip key="st" tone={p.status.tone} label={p.status.label} soft={compact} onPress={p.status.onPress} a11y={t("card.changeStatus", { s: p.status.label })} /> : null,
    ...(p.signs ?? []).map((s, i) => <Chip key={`sg${i}`} tone={s.tone} label={s.label} soft />),
    p.trade && !compact ? <Tag key="tr" label={p.trade} icon="toolbox" /> : null,
    ...(compact ? [] : (p.tags ?? []).map((x) => <Tag key={`t${x}`} label={x} />)),
  ].filter(Boolean);

  return (
    <Press
      onPress={p.onPress}
      // a card without a tap (e.g. an expense) is not a button and is not dimmed like a disabled control
      accessibilityRole={p.onPress ? "button" : undefined}
      accessibilityLabel={p.title}
      accessibilityActions={a11yActions}
      onAccessibilityAction={(e) => {
        const a = actions.find((x) => x.kind === e.nativeEvent.actionName);
        if (a) open(a)();
      }}
      testID={p.testID ?? "list-card"}
      containerStyle={{ flexGrow: 1 }}
      style={{
        flexGrow: 1,
        gap: compact ? space[2] : space[3],
        padding: compact ? space[2] : space[3],
        paddingLeft: space[4],
        borderRadius: compact ? radius.field : radius.inner,
        backgroundColor: c.surf,
        borderWidth: p.selected ? component.selectedBorder : component.hairline,
        borderColor: p.selected ? c.ink : c.bd,
        overflow: "hidden",
        shadowColor: c.shadow.color,
        shadowOpacity: compact ? 0 : c.shadow.opacity,
        shadowRadius: c.shadow.radius,
        shadowOffset: { width: 0, height: c.shadow.offsetY },
      }}
    >
      {edge ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: component.statusEdge, backgroundColor: c.status[edge].fill }} /> : null}
      {/* header */}
      <View style={{ flexDirection: "row", gap: space[3], alignItems: "flex-start" }}>
        <Lead lead={p.lead} small={compact} />
        <View style={{ flex: 1, minWidth: 0, gap: spaceHalf.hair }}>
          <Txt v={compact ? "body" : "heading"} w="semibold" color={c.ink}>{p.title}</Txt>
          {p.when && p.value ? <Txt v="caption" color={c.mut}>{p.when}</Txt> : null}
          {compact && chips.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[1] }}>{chips}</View> : null}
        </View>
        {valueText}
      </View>
      {!compact && chips.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>{chips}</View> : null}
      {/* facts */}
      {lines.length || p.queued ? (
        <View style={{ gap: spaceHalf.tight }}>
          {p.queued ? (
            <View style={{ flexDirection: "row", gap: space[3], paddingLeft: LEAD_INSET }}>
              <Icon name="cloud" s={size.iconSm} color={c.ink} />
              <Txt w="semibold" color={c.ink}>{t("card.queued")}</Txt>
            </View>
          ) : null}
          {lines.map((l) =>
            "pair" in l ? (
              <View key={l.pair.join("+")} style={{ flexDirection: "row", gap: space[3] }}>
                {fact(l.pair[0], "first")}
                {fact(l.pair[1], "second")}
              </View>
            ) : (
              fact(l.key, "single")
            ),
          )}
        </View>
      ) : null}
      {p.reasons?.length && !compact ? (
        <View style={{ gap: space[2], paddingTop: space[2], borderTopWidth: component.hairline, borderTopColor: c.bd }}>
          {p.reasons.map((r) => (
            <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
              <Pressable onPress={r.onPress} disabled={!r.onPress} accessibilityRole={r.onPress ? "button" : undefined} accessibilityLabel={r.text} style={{ flex: 1, flexDirection: "row", gap: space[3], alignItems: "flex-start", minHeight: size.hitMin, paddingLeft: LEAD_INSET }}>
                <View style={{ paddingTop: spaceHalf.hair }}>
                  <Icon name={statusIcon[r.tone]} s={size.iconSm} color={r.tone === "neutral" ? c.mut : c.status[r.tone].text} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt w="semibold" color={c.ink}>{r.text}</Txt>
                  {r.detail ? <Txt v="caption" color={c.mut}>{r.detail}</Txt> : null}
                </View>
              </Pressable>
              {r.action ? (
                <Tap visible={component.button.sm} onPress={r.action.onPress} label={r.action.label}>
                  <View style={{ height: component.button.sm, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, justifyContent: "center" }}>
                    <Txt v="button" w="semibold" color={c.ink}>{r.action.label}</Txt>
                  </View>
                </Tap>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {/* bottom block (figures, progress, buttons) pinned to the bottom: in a grid row they line up across cards */}
      {(density === "rich" && (p.figures?.length || p.progress)) || actions.length || p.action ? (
      <View style={{ marginTop: "auto", gap: space[3] }}>
      {density === "rich" && p.figures?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spaceHalf.tight }}>
          {p.figures.map((f) => {
            const tone = f.tone && f.tone !== "neutral" ? f.tone : undefined;
            return (
              <View key={f.label} style={{ flexGrow: 1, flexBasis: component.tileMin, minWidth: component.tileMin, paddingVertical: spaceHalf.tight, paddingHorizontal: space[2], borderRadius: radius.field, backgroundColor: c.in, borderWidth: component.hairline, borderColor: c.bd, gap: spaceHalf.hair }}>
                <Txt v="caption" w="semibold" color={c.mut}>{f.label}</Txt>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                  {tone ? <Icon name={statusIcon[tone]} s={size.iconXs} color={c.status[tone].text} /> : null}
                  <Txt w="semibold" color={tone ? c.status[tone].text : c.ink} tabular>{f.value}</Txt>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {density === "rich" && p.progress ? (
        <View style={{ gap: space[1] }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: p.progress.max, now: p.progress.value }}>
          <View style={{ height: component.stepBar, borderRadius: radius.pill, backgroundColor: c.track, overflow: "hidden" }}>
            <View style={{ width: `${p.progress.max ? Math.min(100, (p.progress.value / p.progress.max) * 100) : 0}%`, height: "100%", backgroundColor: c.status.ok.fill }} />
          </View>
          {p.progress.label ? <Txt v="caption" color={c.mut}>{p.progress.label}</Txt> : null}
        </View>
      ) : null}
      {/* contact buttons (call, SMS, map, email) + main action */}
      {actions.length || p.action ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingTop: space[2], borderTopWidth: component.hairline, borderTopColor: c.bd }}>
          {actions.map((a) => (
            <Tap key={a.kind} visible={btn} onPress={open(a)} label={t(`card.act.${a.kind}`, { v: a.value })}>
              <View style={{ width: btn, height: btn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
                <Icon name={a.icon} s={size.iconMd} color={c.ink} />
              </View>
            </Tap>
          ))}
          <View style={{ flex: 1 }} />
          {p.action ? (
            <Tap visible={btn} onPress={p.action.onPress} label={p.action.label}>
              <View style={{ height: btn, paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, justifyContent: "center" }}>
                <Txt v="button" w="semibold" color={c.ink}>{p.action.label}</Txt>
              </View>
            </Tap>
          ) : null}
        </View>
      ) : null}
      </View>
      ) : null}
    </Press>
  );
}

/** desktop row: fixed value column (fits "$12,400.00") and two 28 buttons */
const ROW_VALUE_W = component.tileMin + space[4];
const ROW_ACTIONS_W = component.button.sm * 2 + space[1];

/* ---------- desktop row (1280): same data, places become columns; text wraps ---------- */
function ListCardRow(p: ListCardProps) {
  const { c } = useTheme();
  const { t } = useI18n();
  const cols = rowColumns(p.columns ?? []);
  const all = contactActions(p.contact ?? {}, Platform.OS as OS);
  // two buttons fit a row: call, then the card's main action if any (e.g. «Reply» on a new lead), otherwise the map
  const actions = all.filter((a) => a.kind === "call" || (!p.action && a.kind === "map"));
  const edge = p.edge !== undefined ? p.edge : edgeTone([p.status?.tone, ...(p.signs ?? []).map((s) => s.tone)]);
  const btn = component.button.sm;
  return (
    <Press
      onPress={p.onPress}
      // a card without a tap (e.g. an expense) is not a button and is not dimmed like a disabled control
      accessibilityRole={p.onPress ? "button" : undefined}
      accessibilityLabel={p.title}
      testID={p.testID ?? "list-card"}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space[3],
        minHeight: size.hitMin,
        paddingVertical: space[2],
        paddingHorizontal: space[3],
        borderRadius: radius.field,
        backgroundColor: c.surf,
        borderWidth: p.selected ? component.selectedBorder : component.hairline,
        borderColor: p.selected ? c.ink : c.bd,
        overflow: "hidden",
      }}
    >
      {edge ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: component.statusEdge, backgroundColor: c.status[edge].fill }} /> : null}
      <Lead lead={p.lead} small />
      <View style={{ flex: 1.3, minWidth: 0, gap: spaceHalf.hair }}>
        <Txt w="semibold" color={c.ink}>{p.title}</Txt>
        {/* the document number is not a column: it sits under the name, with "when" */}
        {p.facts?.num || p.when ? <Txt v="caption" color={c.mut}>{[p.facts?.num, p.when].filter(Boolean).join(" · ")}</Txt> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1], marginTop: space[1] }}>
          {p.status ? <Chip tone={p.status.tone} label={p.status.label} soft onPress={p.status.onPress} a11y={t("card.changeStatus", { s: p.status.label })} /> : null}
          {(p.signs ?? []).map((s, i) => <Chip key={i} tone={s.tone} label={s.label} soft />)}
          {p.trade ? <Tag label={p.trade} icon="toolbox" /> : null}
          {(p.tags ?? []).map((x) => <Tag key={x} label={x} />)}
        </View>
      </View>
      {cols.map((k) => (
        <View key={k} style={{ flex: 1, minWidth: 0, paddingTop: spaceHalf.hair }} accessible accessibilityLabel={`${t(`card.fact.${k}`)}: ${p.facts?.[k] ?? ""}`}>
          <Txt color={p.facts?.[k] ? c.ink : c.mut} lines={FACT_MAX_LINES}>{p.facts?.[k] || "—"}</Txt>
        </View>
      ))}
      {/* fixed columns: every row keeps the same lines whether or not it has a value or both buttons */}
      <View style={{ width: ROW_VALUE_W, alignItems: "flex-end" }}>
        {p.value ? <Txt w="semibold" color={p.valueTone && p.valueTone !== "neutral" ? c.status[p.valueTone].text : c.ink} tabular>{p.value}</Txt> : null}
      </View>
      <View style={{ width: ROW_ACTIONS_W, flexDirection: "row", justifyContent: "flex-end", gap: space[1] }}>
        {actions.map((a) => (
          <Tap key={a.kind} visible={btn} onPress={() => (p.onContact ? p.onContact(a) : openContact(a))} label={t(`card.act.${a.kind}`, { v: a.value })}>
            <View style={{ width: btn, height: btn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
              <Icon name={a.icon} s={size.iconSm} color={c.ink} />
            </View>
          </Tap>
        ))}
        {p.action ? (
          <Tap visible={btn} onPress={p.action.onPress} label={p.action.label}>
            <View style={{ width: btn, height: btn, borderRadius: radius.pill, backgroundColor: c.surf2, borderWidth: component.hairline, borderColor: c.bd, alignItems: "center", justifyContent: "center" }}>
              <Icon name={p.action.icon ?? "send"} s={size.iconSm} color={c.ink} />
            </View>
          </Tap>
        ) : null}
      </View>
    </Press>
  );
}

/* ---------- grid of cards: rows of equal height, equal gaps, edges on one line ----------
 * Phone 1 column, tablet 2, desktop 3 (layout.gridCols). Every card in a row stretches to the tallest one, so tops,
 * bottoms and the button lines match; an unfinished last row keeps the column width (empty cells). */
export function CardGrid({ children, cols }: { children: ReactNode[]; cols?: number }) {
  const { device } = useDevice();
  const n = cols ?? layout.gridCols[device];
  const items = children.filter(Boolean);
  if (n <= 1) return <View style={{ gap: space[2] }}>{items}</View>;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return (
    <View style={{ gap: space[3] }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "stretch", gap: space[3] }}>
          {Array.from({ length: n }, (_, k) => (
            <View key={k} style={{ flex: 1, minWidth: 0 }}>{r[k] ?? null}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

/* ---------- desktop: column titles above the rows (same widths as ListCardRow) ---------- */
export function ListCardHeader({ title, columns, value }: { title: string; columns: readonly FactKey[]; value?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const cap = (s: string) => <Txt v="caption" w="semibold" color={c.mut}>{s}</Txt>;
  return (
    <View style={{ flexDirection: "row", gap: space[3], paddingHorizontal: space[3], borderWidth: component.hairline, borderColor: "transparent" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: component.avatar.sm }} />
      <View style={{ flex: 1.3 }}>{cap(title)}</View>
      {rowColumns(columns).map((k) => <View key={k} style={{ flex: 1 }}>{cap(t(`card.fact.${k}`))}</View>)}
      <View style={{ width: ROW_VALUE_W, alignItems: "flex-end" }}>{value ? cap(value.charAt(0).toUpperCase() + value.slice(1)) : null}</View>
      <View style={{ width: ROW_ACTIONS_W }} />
    </View>
  );
}

/* ---------- status picker: every status, the allowed ones enabled; app-set ones locked ---------- */
export interface StatusPickerOption {
  key: string;
  tone: StatusName;
  label: string;
  current: boolean;
  enabled: boolean;
  /** "form": choosing it opens the existing form (reason / date) */
  form?: boolean;
}

export function StatusPicker({ visible, onClose, title, options, onPick }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: StatusPickerOption[];
  onPick: (key: string) => void;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View accessibilityRole="radiogroup" style={{ gap: spaceHalf.hair }}>
        {options.map((o) => {
          const row = (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: component.rowOption, paddingHorizontal: space[3], borderRadius: radius.field, backgroundColor: o.current ? c.surf2 : undefined }}>
              <Chip tone={o.tone} label={o.label} />
              <View style={{ flex: 1 }}>
                {!o.enabled && !o.current ? <Txt v="caption" color={c.mut}>{t("card.auto")}</Txt> : o.form ? <Txt v="caption" color={c.mut}>{t("card.byForm")}</Txt> : null}
              </View>
              {o.current ? <Icon name="check" s={size.iconMd} color={c.ink} /> : !o.enabled ? <Icon name="lock" s={size.iconSm} color={c.mut} /> : null}
            </View>
          );
          return o.enabled && !o.current ? (
            <Pressable key={o.key} onPress={() => onPick(o.key)} accessibilityRole="radio" accessibilityState={{ checked: false }} accessibilityLabel={o.label}>
              {row}
            </Pressable>
          ) : (
            <View key={o.key} accessibilityRole="radio" accessibilityState={{ checked: o.current, disabled: !o.current }} accessibilityLabel={o.current ? o.label : `${o.label}, ${t("card.auto")}`}>
              {row}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

/** hook for a list screen: one picker for the whole list */
export function useStatusPicker() {
  const [open, setOpen] = useState<string | null>(null);
  return { openFor: open, open: (id: string) => setOpen(id), close: () => setOpen(null) };
}
