import type { ReactNode } from "react";
import { View } from "react-native";
import { size, space, spaceHalf, statusIcon, type StatusName } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, T } from "./primitives";

/**
 * A line of text in a status colour (DS §3.1 п.2, rule 2, #1386): the tone's icon (`statusIcon`), then the words in the
 * same tone — never the colour alone. A warning under a field, «выше лимита», «не получилось»: one component, so the
 * guard in designSystem.test.ts can say «a warn / bad text outside it is a mistake». `v` — caption (default), body, or heading (a section title in a status tone: «Ждут мастера · 3»).
 */
export function StatusNote({ tone, children, v = "caption", testID }: { tone: Exclude<StatusName, "neutral">; children: ReactNode; v?: "caption" | "body" | "heading"; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-start", gap: space[1] }}>
      <View testID={testID ? `${testID}-icon` : undefined} style={{ paddingTop: v === "caption" ? 0 : spaceHalf.hair }}>
        <Icon name={statusIcon[tone]} s={size.iconSm} color={c.status[tone].text} />
      </View>
      <T v={v} tone={tone} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}
