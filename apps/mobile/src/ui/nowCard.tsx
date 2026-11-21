/**
 * NowCard (visual v2, Главная): «Сейчас» or «Дальше» — the one visit / step that matters now.
 * A card (`surf`, `radius.card`, the top highlight — no accent frame, v2: the yellow is the button). On top 12 «ДАЛЬШЕ · 8:30–12:30» and
 * on the right «через 10 мин» or a StatusPill; below the name 17, «работа · мастер» 13, the address as a link (→ the maps);
 * `progress` — «Работа · 3 из 5 · 62 %» in words (no bar). On the Overviews the pair (`ButtonPair`): the filled `main` («В пути»), the
 * dark `second` («Маршрут») and a round `icon` («☎»); inside an object no button — the whole card opens (`onPress`, «›»).
 * Nothing — `empty` («На сегодня всё · завтра 9:00»).
 */
import { View } from "react-native";
import { size, space, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { ProgressBar } from "./controls";
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
  /** «Работа · 3 из 5 · 62 %» */
  progress?: { caption: string; value: number; max: number; label?: string };
  /** inside an object: the whole card opens, with «›» */
  onPress?: () => void;
  /** nothing now: «На сегодня всё · завтра 9:00» */
  empty?: string;
  testID?: string;
}

export function NowCard({ kicker, when, status, title, sub, address, main, second, icon, progress, onPress, empty, testID }: NowCardProps) {
  const { c } = useTheme();
  return (
    <View testID={testID}>
      <Card onPress={!main && title ? onPress : undefined} accessibilityLabel={[kicker, when, title, sub].filter(Boolean).join(", ")}>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="micro" w="semibold" tone="mut" style={{ flex: 1, textTransform: "uppercase" }} numberOfLines={1}>
            {kicker}
          </T>
          {status ? <StatusPill status={status.status} label={status.label} /> : when ? (
            <T v="micro" w="semibold" tone="mut" numberOfLines={1}>
              {when}
            </T>
          ) : null}
        </RowView>
        {title ? (
          <>
            <RowView>
              <View style={{ flex: 1 }}>
                <T v="heading" numberOfLines={2}>
                  {title}
                </T>
                {sub ? (
                  <T v="caption" tone="mut" numberOfLines={1}>
                    {sub}
                  </T>
                ) : null}
              </View>
              {onPress && !main ? <Icon name="chevronRight" s={size.iconSm} color={c.mut} /> : null}
            </RowView>
            {address ? (
              <Press onPress={address.onPress} visibleHeight={size.iconSm} accessibilityRole="link" accessibilityLabel={address.a11y} containerStyle={{ alignSelf: "flex-start" }}>
                <T v="caption" style={{ color: c.accText }} numberOfLines={1}>
                  {address.text}
                </T>
              </Press>
            ) : null}
            {progress ? <ProgressBar caption={progress.caption} value={progress.value} max={progress.max} label={progress.label} /> : null}
            {main ? (
              <View style={{ gap: space[1], marginTop: space[1] }}>
                <ButtonPair
                  main={{ label: main.label, onPress: main.onPress, disabled: main.disabled, testID: main.testID, variant: main.outline ? "secondary" : "primary" }}
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
