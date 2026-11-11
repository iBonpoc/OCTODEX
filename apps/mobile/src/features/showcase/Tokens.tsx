import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { radius, space, spaceHalf, tokens } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, Divider, RowView, SectionTitle } from "@/ui/surfaces";
import { T } from "@/ui/primitives";
import { useI18n } from "@/i18n";
import { SECTIONS, type ShowcaseSection } from "./registry";

/** a value that is a colour: hex or rgb(a) */
const isColor = (v: unknown): v is string => typeof v === "string" && /^(#|rgba?\()/.test(v);

/** [path, value] of every leaf of a token group, e.g. ["durFast", 160], ["status.ok.text", "#9CF0A8"] */
export function flatten(value: unknown, path = ""): [string, string | number][] {
  if (Array.isArray(value)) {
    // a short list of numbers (an easing curve) or colours stays one row
    if (value.every((x) => typeof x === "number" || typeof x === "string")) return [[path, value.join(", ")]];
    return value.flatMap((x, i) => flatten(x, `${path}[${i}]`));
  }
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => flatten(v, path ? `${path}.${k}` : k));
  return [[path, value as string | number]];
}

/** a niche module's own tokens (rule 2 exceptions): the drawing canvas storeys, the tape's mark */
const MODULE_ONLY = /^(drawing|tape)\b|\.(drawing|tape)\b/;

/** the group of `tokens` the section draws; themes show the active theme only */
function groupRows(group: string, themeName: string): [string, string | number][] {
  const v = (tokens as Record<string, unknown>)[group];
  if (group === "themes") return flatten((v as Record<string, unknown>)[themeName]);
  return flatten(v);
}

function Sample({ group, path, value }: { group: string; path: string; value: string | number }) {
  const { c } = useTheme();
  const box = space[6];
  let sample: ReactNode = <View style={{ width: box }} />;
  if (isColor(value)) {
    sample = <View style={{ width: box, height: box, borderRadius: radius.tip, backgroundColor: value, borderWidth: 1, borderColor: c.bd }} />;
  } else if (typeof value === "number" && (group === "space" || group === "spaceHalf")) {
    sample = <View style={{ width: Math.max(value, spaceHalf.hair), height: space[2], backgroundColor: c.mut, borderRadius: spaceHalf.hair }} />;
  } else if (typeof value === "number" && group === "radius") {
    sample = <View style={{ width: box, height: box, borderWidth: 1, borderColor: c.mut, borderRadius: Math.min(value, box / 2) }} />;
  }
  return (
    <RowView style={{ paddingVertical: space[1] }} >
      <View style={{ width: space[8], alignItems: "flex-start" }}>{sample}</View>
      <View style={{ flex: 1 }}>
        <View testID={`token-${group}.${path}`}>
          <T v="caption" tone="mut">{`${group}.${path}`}</T>
        </View>
      </View>
      <T v="caption" tabular>{String(value)}</T>
    </RowView>
  );
}

export function TokenSection({ s }: { s: ShowcaseSection }) {
  const { t } = useI18n();
  const { name } = useTheme();
  return (
    <View testID={`showcase-${s.id}`}>
      <SectionTitle title={`${t(s.title)} · ${s.ds}`} />
      {s.tokenGroups.map((g) => {
        const rows = groupRows(g, name);
        return (
          <Card key={g}>
            <View testID={`token-group-${g}`}>
              <T v="heading">{g}</T>
            </View>
            {MODULE_ONLY.test(g) || rows.some(([p]) => MODULE_ONLY.test(p)) ? <T v="caption" tone="mut">{t("ds.moduleOnly")}</T> : null}
            {rows.map(([p, v], i) => (
              <Fragment key={`${p}-${i}`}>
                {i ? <Divider /> : null}
                <Sample group={g} path={p} value={v} />
              </Fragment>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

export const TokenSections = () => (
  <>
    {SECTIONS.filter((s) => s.tokenGroups.length).map((s) => (
      <TokenSection key={s.id} s={s} />
    ))}
  </>
);
