/**
 * The attached pages of an estimate on screen (/p/, signing on site; spec 33 П24.7): the title, the drawing on white
 * paper in both themes (it is a page of the document, as in the PDF), the note, the table. Only what `clientPages`
 * passes is drawn; a text goes as a child of <Text> — never as markup.
 */
import { View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { font, print as P, radius, space } from "@octo/design-tokens";
import { clientPages, diamondPath, fillOf, inkOf, type DocPrim } from "./docPages";
import { T } from "@/ui/primitives";
import { Card, RowView } from "@/ui/surfaces";

function Prim({ p }: { p: DocPrim }) {
  switch (p.t) {
    case "l":
      return (
        <Line
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          stroke={inkOf(p.ink)}
          strokeWidth={p.sw}
          strokeLinecap="round"
          {...(p.dash ? { strokeDasharray: [p.dash, p.dash] } : {})}
        />
      );
    case "c":
      return <Circle cx={p.cx} cy={p.cy} r={p.r} fill={fillOf(p.fill)} stroke={P.ink} strokeWidth={p.sw} />;
    case "d":
      return <Path d={diamondPath(p.cx, p.cy, p.r)} fill={fillOf(p.fill)} stroke={P.ink} strokeWidth={p.sw} />;
    case "r":
      return <Rect x={p.x} y={p.y} width={p.w} height={p.h} fill={P.paper} />;
    case "x":
      return (
<SvgText x={p.x} y={p.y} fontSize={p.fs} fontFamily={font.families.regular} textAnchor={p.anchor ?? "middle"} fill={P.ink}>
          {p.s}
        </SvgText>
      );
  }
}

/** one sheet of shapes on white paper in both themes (a page's drawing; a module's own screen shows it too) — only what
 *  passes the rules is drawn */
export function DocSheet({ sheet, testID }: { sheet: { w: number; h: number; items: unknown[] }; testID?: string }) {
  const page = clientPages([{ id: "s", title: "", w: sheet.w, h: sheet.h, items: sheet.items }])[0];
  if (!page) return null;
  return (
    <View testID={testID} style={{ backgroundColor: P.paper, borderRadius: radius.tip, overflow: "hidden" }}>
      <Svg viewBox={`0 0 ${page.w} ${page.h}`} width="100%" style={{ aspectRatio: page.w / page.h }}>
        {page.items.map((p, i) => (
          <Prim key={i} p={p} />
        ))}
      </Svg>
    </View>
  );
}

export function DocPagesView({ pages: raw }: { pages: unknown }) {
  const pages = clientPages(raw);
  if (!pages.length) return null;
  return (
    <View style={{ gap: space[3] }}>
      {pages.map((pg) => (
        <View key={pg.id} testID={`doc-page-${pg.id}`}>
          <Card>
            <T v="heading" w="semibold">
              {pg.title}
            </T>
            {pg.items.length ? <DocSheet sheet={pg} /> : null}
            {pg.note ? (
              <T v="body" w="semibold">
                {pg.note}
              </T>
            ) : null}
            {pg.head?.length ? (
              <RowView style={{ gap: space[2] }}>
                {pg.head.map((h, i) => (
                  <T key={i} v="caption" tone="mut" style={{ flex: 1 }}>
                    {h}
                  </T>
                ))}
              </RowView>
            ) : null}
            {pg.rows?.map((r, i) => (
              <RowView key={i} style={{ gap: space[2] }}>
                {r.map((c, j) => (
                  <T key={j} v="body" style={{ flex: 1 }}>
                    {c}
                  </T>
                ))}
              </RowView>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}
