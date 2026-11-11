/**
 * Витрина дизайн-системы (#1093): Настройки → «Дизайн-система». The registry is what the guard in designSystem.test.ts
 * reads — a UI component or a token group that is not here turns the checks red, so the showcase cannot fall behind.
 * Rule of the founder (11.11.2026): any change to DESIGN-SYSTEM.md, the tokens or src/ui/** changes the showcase in the
 * same PR, and the PR says «Проверить в витрине: Настройки → Дизайн-система → <раздел> — что сделать, что увидеть».
 */
import type { DictKey } from "@/i18n";

export interface ShowcaseSection {
  /** testID suffix: `showcase-<id>` */
  id: string;
  /** the DESIGN-SYSTEM.md section the samples belong to, «§14.1» — the guard checks the heading exists */
  ds: string;
  title: DictKey;
  /** groups of `tokens` (packages/design-tokens) this section draws, live */
  tokenGroups: string[];
  /** exported components of src/ui/** this section shows */
  components: string[];
}

export const SECTIONS: ShowcaseSection[] = [
  { id: "tokens-color", ds: "§3", title: "ds.sec.color", tokenGroups: ["themes", "statusIcon", "drawing"], components: [] },
  { id: "tokens-text", ds: "§4", title: "ds.sec.text", tokenGroups: ["font"], components: [] },
  { id: "tokens-layout", ds: "§5", title: "ds.sec.layout", tokenGroups: ["space", "spaceHalf", "radius", "size", "breakpoint", "layout", "z", "component"], components: [] },
  { id: "tokens-motion", ds: "§14", title: "ds.sec.motion", tokenGroups: ["motion", "timing"], components: [] },
  { id: "tokens-print", ds: "§19", title: "ds.sec.print", tokenGroups: ["print", "drawingPrint"], components: [] },
];

/**
 * Components of src/ui/** that are not (yet) shown. Shrinks to nothing when the showcase PRs B and C land (#1093):
 * the guard fails on a component that is neither in a section, nor here, nor in UI_NOT_SHOWN.
 */
export const UI_PENDING: readonly string[] = [
  "Columns", "Meter", "ReadOnly", "Button", "IconButton", "StatusChip", "Toggle", "Segmented", "TagChip", "Avatar", "MetaTag", "ProgressBar", "Steps",
  "TextField", "Stepper", "ChoiceChips", "MultiChips", "FilterBar", "FilterRow", "HintsProvider", "ListCard", "CardGrid", "ListCardHeader", "StatusPicker",
  "ListPanel", "Glass", "Menu", "Sheet", "HelpButton", "ToastProvider", "T", "Icon", "Press", "Card", "RowView", "Grid", "SectionTitle", "ListRow", "CardList",
  "Divider", "Empty", "SyncBadge", "Screen",
];

/** components that are plumbing, not something a person sees — each with the reason */
export const UI_NOT_SHOWN: Record<string, string> = {
  "Background": "the screen background under everything; seen on every sample",
  "Scrim": "the dim layer of a sheet; seen in the sheet sample",
};
