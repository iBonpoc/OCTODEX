/**
 * «Графит» — ПИЛОТ, НЕ ПРАВИЛО (#2254, выбор основателя 19.11.2026; пакет чата дизайна, handoff §2).
 * A separate token set next to «Наряд»: only the showcase section «Графит (пилот)» reads it
 * (apps/mobile/src/features/showcase/graphite/**). Nothing else in the app may import it — the guard in
 * apps/mobile/test/designSystem.test.ts checks that. Mirror: design/naryad-ds/tokens/graphite.css (mirror.test.ts).
 * Founder's choice: Jost 300/400/500, background «Светлее» in both themes, glass «Матовое», nav «Прожектор».
 * Roll-back = delete this file, graphite.css and the showcase folder.
 */
import type { ThemeName } from "./index";

/** colours per theme; css: `--gr-<kebab-name>` in `[data-skin="graphite"][data-theme="…"]` */
export interface GraphiteColors {
  /** the scene: top / middle (55 %) / bottom of the background gradient (under the «Рельеф» picture) */
  bg: string;
  bgMid: string;
  bgLow: string;
  scrim: string;
  /** matte panel: fill, 1 pt edge, solid fill with Reduce Transparency */
  panel: string;
  panelEdge: string;
  panelSolid: string;
  /** a tile in a panel: rest / selected / pressed */
  tile1: string;
  tile2: string;
  tile3: string;
  /** a veil under a caption on the scene */
  bgVeil: string;
  /** sheet / alert / menu body */
  sheetBg: string;
  chip: string;
  chipOn: string;
  /** the 34 pt square icon of a row */
  giBg: string;
  text: string;
  text2: string;
  /** scale ticks and handles only — never text */
  text3: string;
  acc: string;
  onAcc: string;
  sel: string;
  onSel: string;
  div: string;
  border: string;
  borderS: string;
  fieldBg: string;
  fieldEdge: string;
  focus: string;
  /** the «Прожектор» beam: line, its upper edge, glow, the cone down from it (top → bottom) */
  beam: string;
  beamTop: string;
  beamGlow: string;
  coneTop: string;
  coneBottom: string;
  /** status word colour (`-w`) and its icon colour (`ic`): always icon + word (handoff v2 §3 п.4) */
  bad: string;
  warn: string;
  info: string;
  ok: string;
  badIc: string;
  warnIc: string;
  infoIc: string;
  okIc: string;
  danBg: string;
  onDan: string;
  toast: string;
  onToast: string;
  badge: string;
  onBadge: string;
  av: string;
  onAv: string;
  /** liquid glass fallback (iOS < 26): fill, dim under a caption, the three rim layers, solid with Reduce Transparency */
  gl: string;
  glDim: string;
  glRimHi: string;
  glRimLo: string;
  glRimLine: string;
  glSolid: string;
}

export const graphiteThemes: Record<ThemeName, GraphiteColors> = {
  dark: {
    bg: "#383C41",
    bgMid: "#474C52",
    bgLow: "#575D64",
    scrim: "rgba(0,0,0,.5)",
    panel: "rgba(38,40,44,.75)",
    panelEdge: "rgba(255,255,255,.14)",
    panelSolid: "#2A2D31",
    tile1: "rgba(255,255,255,.06)",
    tile2: "rgba(255,255,255,.11)",
    tile3: "rgba(255,255,255,.16)",
    bgVeil: "rgba(12,13,15,.55)",
    sheetBg: "rgba(36,38,42,.93)",
    chip: "#303337",
    chipOn: "#ECEDEE",
    giBg: "#34373B",
    text: "#F2F3F4",
    text2: "#CDD1D5",
    text3: "#8F9499",
    acc: "#FBFF00",
    onAcc: "#040505",
    sel: "#ECEDEE",
    onSel: "#1B1D20",
    div: "rgba(255,255,255,.09)",
    border: "rgba(255,255,255,.08)",
    borderS: "rgba(255,255,255,.18)",
    fieldBg: "rgba(255,255,255,.07)",
    fieldEdge: "rgba(255,255,255,.40)",
    focus: "#ECEDEE",
    beam: "#FBFF00",
    beamTop: "rgba(250,255,120,.95)",
    beamGlow: "rgba(251,255,0,.45)",
    coneTop: "rgba(251,255,90,.34)",
    coneBottom: "rgba(251,255,90,.10)",
    bad: "#FF9C8A",
    warn: "#F2C66A",
    info: "#9CC4EF",
    ok: "#93D3A0",
    badIc: "#E85E62",
    warnIc: "#F49D4F",
    infoIc: "#4FA6E8",
    okIc: "#7AD8A2",
    danBg: "#FF9C8A",
    onDan: "#040505",
    toast: "#2A2D31",
    onToast: "#F2F3F4",
    badge: "#ECEDEE",
    onBadge: "#1B1D20",
    av: "#3E4247",
    onAv: "#F2F3F4",
    gl: "rgba(18,19,21,.45)",
    glDim: "rgba(0,0,0,.28)",
    glRimHi: "rgba(255,255,255,.55)",
    glRimLo: "rgba(255,255,255,.18)",
    glRimLine: "rgba(255,255,255,.14)",
    glSolid: "#2A2D31",
  },
  light: {
    bg: "#ECEDEE",
    bgMid: "#D5D8DB",
    bgLow: "#B9BDC1",
    scrim: "rgba(22,24,26,.32)",
    panel: "rgba(246,247,248,.544)",
    panelEdge: "rgba(255,255,255,.75)",
    panelSolid: "#F4F5F6",
    tile1: "rgba(255,255,255,.45)",
    tile2: "rgba(255,255,255,.72)",
    tile3: "#FFFFFF",
    bgVeil: "rgba(246,247,248,.6)",
    sheetBg: "rgba(240,241,242,.93)",
    chip: "#DCDFE2",
    chipOn: "#FFFFFF",
    giBg: "#FFFFFF",
    text: "#16181A",
    text2: "#3C4045",
    text3: "#6B7076",
    acc: "#FBFF00",
    onAcc: "#040505",
    sel: "#FFFFFF",
    onSel: "#16181A",
    div: "rgba(22,24,26,.10)",
    border: "rgba(22,24,26,.10)",
    borderS: "rgba(22,24,26,.24)",
    fieldBg: "rgba(255,255,255,.66)",
    fieldEdge: "rgba(22,24,26,.50)",
    focus: "#3A3E43",
    beam: "#5F6100",
    beamTop: "rgba(95,97,0,.95)",
    beamGlow: "rgba(40,42,0,.35)",
    coneTop: "rgba(214,218,0,.42)",
    coneBottom: "rgba(214,218,0,.14)",
    bad: "#A3221B",
    warn: "#6E4D00",
    info: "#1B5290",
    ok: "#1E5F34",
    badIc: "#C8322B",
    warnIc: "#C46A1C",
    infoIc: "#1F6FC0",
    okIc: "#2E8A50",
    danBg: "#9E1C16",
    onDan: "#FFFFFF",
    toast: "#FFFFFF",
    onToast: "#16181A",
    badge: "#1B1D20",
    onBadge: "#ECEDEE",
    av: "#D5D8DB",
    onAv: "#16181A",
    gl: "rgba(255,255,255,.34)",
    glDim: "rgba(255,255,255,.45)",
    glRimHi: "rgba(255,255,255,.95)",
    glRimLo: "rgba(255,255,255,.5)",
    glRimLine: "rgba(255,255,255,.55)",
    glSolid: "#D5D8DB",
  },
};

/** numbers; css: `--gr-<group>-<key>` in `[data-skin="graphite"]` */
export const graphite = {
  themes: graphiteThemes,
  /** Jost (SIL OFL, design/naryad-ds/graphite/OFL-Jost.txt): 300, 400; 500 only the main button and the selected item */
  font: {
    family: { light: "Jost_300Light", regular: "Jost_400Regular", medium: "Jost_500Medium" },
    size: { display: 34, title: 22, body: 17, sub: 15, caption: 13, micro: 12 },
    lineHeight: { display: 40, title: 28, body: 22, sub: 20, caption: 18, micro: 16 },
    displayTracking: -0.3,
    /** weight 300 only from this size up; under it text is ≥ 400 (v2 §3 п.10) */
    lightFrom: 22,
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 },
  radius: { xs: 6, sm: 9, control: 12, tile: 12, card: 14, main: 16, sheet: 16, icon: 10, pill: 999 },
  /** only three control heights: 44, 52, 56 */
  size: { control: 44, button: 52, row: 56, plus: 52, nav: 64, icon: 34, glyph: 20, check: 24, badge: 18, hairline: 0.5, edge: 1, focus: 1.5 },
  /** «Прожектор»: beam line per theme, the cone under it; the glow radius per theme (light: none, v2 §2.9) */
  beam: { dark: 2, light: 3, cone: 24, glowDark: 12, glowLight: 0 },
  /** matte glass «Матовое» (--glassT 55): CSS blur 19.5 pt ≈ expo-blur intensity; liquid fallback blur */
  glass: { blurPt: 19.5, intensity: 50, liquidIntensity: 12 },
  /** one curve, no springs (handoff §2.8) */
  motion: {
    curve: [0.23, 1, 0.32, 1] as const,
    pressIn: 80,
    pressOut: 150,
    color: 120,
    sheetUp: 320,
    sheetDown: 240,
    beam: 320,
    toastIn: 250,
    toastOut: 200,
    toastLife: 5000,
    toastStack: 3,
    reduced: 120,
    pressScale: 0.97,
    pressDim: 0.16,
    behindScale: 0.96,
    toastRise: 12,
  },
  /** the sheet: side margin, float above the bottom, gap under the status bar; detents and close rules */
  sheet: { maxDetents: 3, side: 8, float: 8, topGap: 60, quarter: 0.25, half: 0.5, closeVelocity: 0.5, closeBelow: 0.3, projectMs: 150, resist: 0.25 },
  /** layers, bottom → top */
  z: { scene: 0, panel: 1, header: 10, nav: 20, scrim: 30, sheet: 40, toast: 70 },
} as const;

export type Graphite = typeof graphite;
