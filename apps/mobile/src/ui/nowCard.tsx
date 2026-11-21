/**
 * NowCard (visual v2, Главная): «Сейчас» or «Дальше» — the one visit / step that matters now.
 * A card (`surf`, `radius.card`, the top highlight — no accent frame, v2: the yellow is the button). On top 12 «ДАЛЬШЕ · 8:30–12:30» and
 * on the right «через 10 мин» or a StatusPill; below the name 17, «работа · мастер» 13, the address as a link (→ the maps);
 * `trio` — «тройка цифр» (NumberTrio); `progress` — «Работа · 3 из 5 · 62 %» in words (no bar). On the Overviews the pair (`ButtonPair`): the filled `main` («В пути»), the
 * dark `second` («Маршрут») and a round `icon` («☎»); inside an object no button — the whole card opens (`onPress`, «›»).
 * Nothing — `empty` («На сегодня всё · завтра 9:00»).
 */
import { View } from "react-native";
import { font, rhythm, size, space, spaceHalf, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, ProgressBar } from "./controls";
import { NumberTrio, ProgressWords } from "./figures";
import { ButtonPair } from "./pairs";
import { Icon, Press, T, type IconKey } from "./primitives";
import { Card, RowView } from "./surfaces";
import { StatusPill } from "./statusPill";
import type { IconAction, MainAction } from "./templates/types";

export interface NowCardProps {
  /** «ДАЛЬШЕ · 8:30–12:30» (drawn in capitals) */
  kicker: string;
  /** «через 10 мин» on the right (or `status`) */
  when?: string;
  /** visual v2 Главная (макет 1): «через 10 мин» as an info pill (◷) right after the kicker; `window` — «8:30–12:30» 13 `mut` on the right */
  soon?: string;
  window?: string;
  /** visual v2 Главная: the name 22/700 and the card's v2 rhythm (name +10, progress +12, trio +12, the pair +14) */
  big?: boolean;
  /** the icon of the filled `main` («✓ В пути») */
  mainIcon?: IconKey;
  status?: { status: StatusName; label: string };
  /** the client / the visit's name; none — the card is the `empty` line */
  title?: string;
  /** «работа · мастер» */
  sub?: string;
  /** the address: a link to the maps of the platform */
  address?: { text: string; a11y: string; onPress: () => void };
  /** the Overviews: the step as the filled button (with its reason under it) */
  main?: MainAction;
  /** the dark button beside it («Маршрут») */
  second?: MainAction & { icon?: IconKey };
  /** a round icon at the end of the pair («Позвонить») */
  icon?: IconAction;
  /** «тройка цифр» under the lines (v2 Главная: «4 ч на месте · 0 из 4 чек-лист · Alex мастер») */
  trio?: readonly [{ value: string; label: string }, { value: string; label: string }, { value: string; label: string }];
  /** «Работа · 3 из 5 · 62 %» */
  progress?: { caption: string; value: number; max: number; label?: string };
  /** inside an object: the whole card opens, with «›» */
  onPress?: () => void;
  /** nothing now: «На сегодня всё · завтра 9:00» */
  empty?: string;
  testID?: string;
  /**
   * visual v2 макет 3 «Клиент»: no kicker line — the title 15/600 with the StatusPill on its own line («Bathroom remodel ✓ Смета
   * принята»); `kicker` is then only read by VoiceOver
   */
  bare?: boolean;
  /** «Смета ✓ · задаток ✓ · работа» on the left, «3 из 5 · 62 %» on the right — progress in words, no bar */
  words?: { caption: string; value?: string };
  /** the trio's look: `plain` — the word 12 over the figure 22, no cells (макет 3 `.num3`) */
  trioLook?: "cells" | "plain";
}

export function NowCard({ kicker, when, soon, window: span, big, mainIcon, status, title, sub, address, main, second, icon, trio, progress, onPress, empty, testID, bare, words, trioLook }: NowCardProps) {
  const { c } = useTheme();
  // v2 макет 1: the card's own rhythm over the Card's gap 8
  const gapAt = (n: number) => (big ? { marginTop: n - space[2] } : null);
  return (
    <View testID={testID}>
      <Card onPress={!main && title ? onPress : undefined} accessibilityLabel={[kicker, when, title, sub].filter(Boolean).join(", ")}>
        {bare && title ? null : (
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="micro" w="semibold" tone="mut" style={{ flex: soon || span ? undefined : 1, flexShrink: 1, textTransform: "uppercase", letterSpacing: big ? font.size.micro * KICK_TRACKING : undefined }} numberOfLines={1}>
            {kicker}
          </T>
          {soon ? <StatusPill status="info" label={soon} /> : null}
          {soon || span ? <View style={{ flex: 1 }} /> : null}
          {span && !status ? (
            <T v="caption" tone="mut" tabular numberOfLines={1}>
              {span}
            </T>
          ) : null}
          {status ? <StatusPill status={status.status} label={status.label} /> : when && !soon ? (
            <T v="micro" w="semibold" tone="mut" numberOfLines={1}>
              {when}
            </T>
          ) : null}
        </RowView>
        )}
        {title ? (
          <>
            {(() => {
              const head = bare ? (
                // v2 макет 3: «Bathroom remodel ✓ Смета принята» — the title 15/600 and the status on one line
                <RowView>
                  <T v="body" w="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {title}
                  </T>
                  {status ? <StatusPill status={status.status} label={status.label} /> : null}
                </RowView>
              ) : (
                <RowView style={gapAt(rhythm.headGap)}>
                  <View style={{ flex: 1 }}>
                    <T v={big ? "title" : "heading"} numberOfLines={2}>
                      {title}
                    </T>
                    {sub ? (
                      <T v="caption" tone="mut" numberOfLines={1}>
                        {sub}
                      </T>
                    ) : null}
                  </View>
                  {onPress ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
                </RowView>
              );
              // with a step inside, the card is not one button: the title opens the record by itself (no button inside a button)
              return onPress && main ? (
                <Press testID={testID ? `${testID}-open` : undefined} onPress={onPress} accessibilityRole="button" accessibilityLabel={[title, sub].filter(Boolean).join(", ")}>
                  {head}
                </Press>
              ) : (
                head
              );
            })()}
            {address ? (
              <Press onPress={address.onPress} visibleHeight={size.iconSm} accessibilityRole="link" accessibilityLabel={address.a11y} containerStyle={{ alignSelf: "flex-start" }}>
                <T v="caption" style={{ color: c.accText }} numberOfLines={1}>
                  {address.text}
                </T>
              </Press>
            ) : null}
            {big ? (
              <>
                {progress ? (
                  <View style={gapAt(rhythm.rowGap)}>
                    <ProgressBar caption={progress.caption} value={progress.value} max={progress.max} label={progress.label} />
                  </View>
                ) : null}
                {trio ? (
                  <View style={gapAt(rhythm.rowGap)}>
                    <NumberTrio testID={testID ? `${testID}-trio` : undefined} items={trio} />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {words ? <ProgressWords testID={testID ? `${testID}-words` : undefined} caption={words.caption} value={words.value} /> : null}
            {trio ? <NumberTrio testID={testID ? `${testID}-trio` : undefined} items={trio} look={trioLook} /> : null}
                {progress ? <ProgressBar caption={progress.caption} value={progress.value} max={progress.max} label={progress.label} /> : null}
              </>
            )}
            {main && !second && !icon ? (
              // inside an object (visual v2 «Клиент»): the step's button by its words, its reason beside it (≤ 2 lines) — never across a 1280 card
              <RowView style={{ marginTop: space[1] }}>
                <Button label={main.label} onPress={main.onPress} disabled={main.disabled} testID={main.testID} variant={main.outline ? "secondary" : "primary"} />
                {main.reason ? (
                  <T v="caption" tone="mut" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                    {main.reason}
                  </T>
                ) : null}
              </RowView>
            ) : main ? (
              <View style={{ gap: space[1], marginTop: big ? BIG_PAIR_GAP - space[2] : space[1] }}>
                <ButtonPair
                  main={{ label: main.label, onPress: main.onPress, disabled: main.disabled, testID: main.testID, variant: main.outline ? "secondary" : "primary", icon: mainIcon }}
                  second={second ? { label: second.label, onPress: second.onPress, disabled: second.disabled, testID: second.testID, icon: second.icon, variant: "secondary" } : null}
                  icon={icon}
                />
                {main.reason ? (
                  <T v="caption" tone="mut" numberOfLines={1}>
                    {main.reason}
                  </T>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <T v="body" tone="mut">
            {empty}
          </T>
        )}
      </Card>
    </View>
  );
}

/** v2 макет 1: the kicker «ДАЛЬШЕ» 12/600 in capitals, tracked .04 em */
const KICK_TRACKING = 0.04;
/** v2 макет 1: the pair stands 14 under the trio */
const BIG_PAIR_GAP = space[3] + spaceHalf.hair;

