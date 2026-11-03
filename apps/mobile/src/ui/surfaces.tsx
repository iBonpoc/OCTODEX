import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import { component, layout, radius, size, space, type StatusName } from "@octo/design-tokens";
import { useDevice, useTheme } from "@/theme/ThemeProvider";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n";
import { Icon, Press, T, type IconKey } from "./primitives";
import { HelpButton } from "./overlays";

/* ---------- Background: --bg + three soft glows (theme.css --glow) ---------- */
export function Background() {
  const { c, name } = useTheme();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {c.glow.map((g, i) => (
            <RadialGradient key={i} id={`g${name}${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="0.6" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect width={width} height={height} fill={c.bg} />
        {c.glow.map((g, i) => (
          <Ellipse key={i} cx={g.cx * width} cy={g.cy * height} rx={g.rx} ry={g.ry} fill={`url(#g${name}${i})`} />
        ))}
      </Svg>
    </View>
  );
}

/* ---------- Card (glass surface) ---------- */
export function Card({
  children,
  style,
  status,
  onPress,
  accessibilityLabel,
  inner,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** tints the left edge with a status color (color = status only) */
  status?: StatusName;
  onPress?: () => void;
  accessibilityLabel?: string;
  inner?: boolean;
}) {
  const { c } = useTheme();
  const base: ViewStyle = {
    backgroundColor: inner ? c.in : c.surf,
    borderWidth: 1,
    borderColor: c.bd,
    borderRadius: inner ? radius.inner : radius.card,
    padding: inner ? space[3] : space[4],
    gap: space[2],
    overflow: "hidden",
    shadowColor: c.shadow.color,
    shadowOpacity: inner ? 0 : c.shadow.opacity,
    shadowRadius: c.shadow.radius,
    shadowOffset: { width: 0, height: c.shadow.offsetY },
  };
  const edge =
    status && status !== "neutral" ? (
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: c.status[status].fill }} />
    ) : null;
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]}>
        {edge}
        {children}
      </Press>
    );
  return (
    <View style={[base, style]}>
      {edge}
      {children}
    </View>
  );
}

/* ---------- Layout helpers ---------- */
export function RowView({ children, style, gap = space[2] }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Grid({ children, raise }: { children: ReactNode[] | ReactNode; /** index of the item to draw above siblings (drag) */ raise?: number }) {
  const { device } = useDevice();
  const [w, setW] = useState(0);
  const cols = layout.gridCols[device];
  const arr = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (cols === 1)
    return (
      <View style={{ gap: space[3] }}>
        {arr.map((ch, i) => (
          <View key={i} style={{ zIndex: raise === i ? 10 : 0 }}>
            {ch}
          </View>
        ))}
      </View>
    );
  const itemW = w ? (w - space[3] * (cols - 1)) / cols : undefined;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3], alignItems: "flex-start" }}
    >
      {arr.map((ch, i) => (
        <View key={i} style={{ width: itemW ?? `${Math.floor(100 / cols) - 2}%`, zIndex: raise === i ? 10 : 0 }}>
          {ch}
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <RowView style={{ justifyContent: "space-between", marginTop: space[3] }}>
      <T v="heading">{title}</T>
      {right}
    </RowView>
  );
}

/** List row: 44–52 tall (rows are not buttons). */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const body = (
    <RowView style={{ minHeight: size.rowMax, paddingVertical: space[2], gap: space[3] }}>
      {left}
      <View style={{ flex: 1 }}>
        <T v="body" w="semibold" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" tone="mut" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {onPress ? <Icon name="chevronRight" s={16} color={c.mut} /> : null}
    </RowView>
  );
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {body}
    </Press>
  ) : (
    body
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.bd }} />;
}

export function Empty({ icon, title, hint, action }: { icon: IconKey; title: string; hint?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: space[8], gap: space[3] }}>
      <View
        style={{
          width: component.fab + space[4],
          height: component.fab + space[4],
          borderRadius: radius.pill,
          backgroundColor: c.surf2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} s={24} />
      </View>
      <T v="heading" center>
        {title}
      </T>
      {hint ? (
        <T v="body" tone="mut" center>
          {hint}
        </T>
      ) : null}
      {action}
    </Card>
  );
}

/* ---------- Offline badge (DS rule 11: queue counter visible) ---------- */
export function OfflineBadge() {
  const { online, queue } = useStore();
  const { c } = useTheme();
  const { t } = useI18n();
  if (online) return null;
  return (
    <RowView
      style={{
        alignSelf: "flex-start",
        height: component.chip.h,
        paddingHorizontal: component.chip.px,
        borderRadius: radius.pill,
        backgroundColor: c.status.warn.fill,
        gap: space[1],
      }}
    >
      <Icon name="wifiOff" s={12} color={c.status.warn.on} />
      <T v="caption" w="semibold" style={{ color: c.status.warn.on }}>
        {t("offline.badge", { n: queue.length })}
      </T>
    </RowView>
  );
}

/* ---------- Nav metrics shared by Screen and TabBar ---------- */
export function useNavInsets() {
  const insets = useSafeAreaInsets();
  const { wide } = useDevice();
  const bottomGap = space[2];
  return {
    wide,
    top: wide ? insets.top + space[3] + component.dockBtn + space[4] + space[3] : insets.top + space[2],
    bottom: wide ? insets.bottom + space[6] : Math.max(insets.bottom, space[3]) + size.tabbarH + bottomGap + space[6],
    tabBottom: Math.max(insets.bottom, space[3]),
    safeTop: insets.top,
  };
}

/* ---------- Screen: background, header with title + "?" + offline badge, scroll ---------- */
export function Screen({
  title,
  help,
  right,
  children,
  scroll = true,
  back,
  subtitle,
}: {
  title: string;
  help?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  back?: () => void;
  subtitle?: string;
}) {
  const nav = useNavInsets();
  const { c } = useTheme();
  const { t } = useI18n();
  const header = (
    <View style={{ gap: space[2], marginBottom: space[3] }}>
      <RowView style={{ justifyContent: "space-between", minHeight: size.hitMin }}>
        <RowView style={{ flex: 1, gap: space[1] }}>
          {back ? (
            <Press onPress={back} visibleHeight={component.dockBtn} accessibilityRole="button" accessibilityLabel={t("common.close")}>
              <View style={{ width: component.dockBtn, height: component.dockBtn, alignItems: "center", justifyContent: "center" }}>
                <Icon name="chevronLeft" color={c.ink} />
              </View>
            </Press>
          ) : null}
          <T v={back ? "title" : "display"} numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </T>
          {help ? <HelpButton title={title} text={help} /> : null}
        </RowView>
        {right}
      </RowView>
      {subtitle ? (
        <T v="body" tone="mut">
          {subtitle}
        </T>
      ) : null}
      <OfflineBadge />
    </View>
  );
  const content = (
    <View style={{ width: "100%", maxWidth: layout.contentMax, alignSelf: "center", gap: space[3] }}>
      {header}
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <Background />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: nav.top, paddingBottom: nav.bottom, paddingHorizontal: space[4] }}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: nav.top, paddingBottom: nav.bottom, paddingHorizontal: space[4] }}>{content}</View>
      )}
    </View>
  );
}
