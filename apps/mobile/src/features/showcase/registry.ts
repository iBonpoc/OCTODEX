/**
 * Витрина дизайн-системы (#1093): Настройки → «Дизайн-система». The registry is what the guard in designSystem.test.ts
 * reads — a UI component or a token group that is not here turns the checks red, so the showcase cannot fall behind.
 * Rule of the founder (11.11.2026): any change to DESIGN-SYSTEM.md, the tokens or src/ui/** changes the showcase in the
 * same PR, and the PR says «Проверить в витрине: Настройки → Дизайн-система → <раздел> — что сделать, что увидеть».
 */
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";

/**
 * One screen of the showcase = one row of its first screen (#1150: a list of sections, each its own screen).
 * `ds` is the DESIGN-SYSTEM.md section the screen is about, shown on the row.
 */
export interface ShowcaseScreen {
  id: string;
  title: DictKey;
  hint: DictKey;
  icon: IconKey;
  ds: string;
  /** «где в приложении»: the screens where this is seen */
  where: DictKey;
  /** a pilot behind a switch of the showcase (#2254): the row and the screen show only when it is on */
  pilot?: "graphite";
  /** not a row of the list: the token tables of the founder-unfriendly kind live folded at the end of the «Графит» sheet (#2292); the address still works */
  hidden?: boolean;
}

export interface ShowcaseSection {
  /** testID suffix: `showcase-<id>` */
  id: string;
  /** which screen of the showcase shows it (ShowcaseScreen.id) */
  screen: string;
  /** the DESIGN-SYSTEM.md section the samples belong to, «§14.1» — the guard checks the heading exists */
  ds: string;
  title: DictKey;
  /** groups of `tokens` (packages/design-tokens) this section draws, live */
  tokenGroups: string[];
  /** exported components of src/ui/** this section shows */
  components: string[];
}

/** the rows of the showcase's first screen, in the order of the founder's list (#1093 comment 12.11.2026) */
export const SCREENS: ShowcaseScreen[] = [
  { id: "base", title: "ds.scr.base", hint: "ds.scr.baseHint", icon: "star", ds: "§3–§4", where: "ds.where.base", hidden: true },
  { id: "buttons", title: "ds.scr.buttons", hint: "ds.scr.buttonsHint", icon: "cursor", ds: "§7", where: "ds.where.buttons" },
  { id: "selectors", title: "ds.sec.selectors", hint: "ds.scr.selectorsHint", icon: "sliders", ds: "§9", where: "ds.where.selectors" },
  { id: "windows", title: "ds.sec.windows", hint: "ds.scr.windowsHint", icon: "copy", ds: "§10", where: "ds.where.windows" },
  { id: "notices", title: "ds.scr.notices", hint: "ds.scr.noticesHint", icon: "bell", ds: "§15", where: "ds.where.notices" },
  { id: "motion", title: "ds.sec.motion", hint: "ds.scr.motionHint", icon: "refresh", ds: "§14", where: "ds.where.motion", hidden: true },
  { id: "choice", title: "ds.scr.choice", hint: "ds.scr.choiceHint", icon: "check", ds: "§9", where: "ds.where.choice" },
  { id: "fields", title: "ds.scr.fields", hint: "ds.scr.fieldsHint", icon: "pencil", ds: "§9", where: "ds.where.fields" },
  { id: "rows", title: "ds.scr.rows", hint: "ds.scr.rowsHint", icon: "note", ds: "§8.3", where: "ds.where.rows" },
  { id: "haptics", title: "ds.scr.haptics", hint: "ds.scr.hapticsHint", icon: "phone", ds: "§15.6", where: "ds.where.haptics" },
  { id: "spacing", title: "ds.sec.layout", hint: "ds.scr.spacingHint", icon: "route", ds: "§5", where: "ds.where.spacing", hidden: true },
  { id: "brand", title: "ds.brand.title", hint: "ds.scr.brandHint", icon: "star", ds: "§18.2", where: "ds.where.brand" },
  // prototype v2 (docs/design/BUILD-PLAN.md §1, wave 1): the shared parts of the five templates
  { id: "proto", title: "ds.scr.proto", hint: "ds.scr.protoHint", icon: "copy", ds: "§12.11", where: "ds.where.proto" },
  // «Графит» — пилот, не правило (#2254): behind the switch on the showcase's first screen, off by default
  { id: "graphite", title: "ds.gr.title", hint: "ds.gr.hint", icon: "sun", ds: "§25", where: "ds.gr.where", pilot: "graphite" },
];

export const SECTIONS: ShowcaseSection[] = [
  { id: "windows", screen: "windows", ds: "§10", title: "ds.sec.windows", tokenGroups: [], components: ["Sheet", "SheetScroll", "HelpButton"] },
  { id: "selectors", screen: "selectors", ds: "§9", title: "ds.sec.selectors", tokenGroups: [], components: ["ViewTabs", "SelectField", "PickerSheet", "FieldError", "Anchored"] },
  { id: "choice", screen: "choice", ds: "§9", title: "ds.scr.choice", tokenGroups: [], components: ["OptionRow", "OptionRows", "OptionTiles", "CheckMark", "ToggleRow", "Toggle", "PctUsdField", "MultiValueField", "ActionRow", "MetaLine", "DoneCircle", "FracKeys"] },
  { id: "fields", screen: "fields", ds: "§9", title: "ds.scr.fields", tokenGroups: [], components: ["NumberField", "TextField", "FieldGroup", "FormMain", "DateField", "FieldRow"] },
  { id: "buttons", screen: "buttons", ds: "§7", title: "ds.scr.buttons", tokenGroups: [], components: ["Button", "IconButton", "Press", "ActionBar", "ButtonPair"] },
  { id: "notices", screen: "notices", ds: "§15", title: "ds.scr.notices", tokenGroups: [], components: ["ToastProvider", "QueueLine", "SyncBadge", "Banner", "StatusNote", "Empty", "EmptyFilter", "EmptySearch", "NotFound", "PageNotFound"] },
  { id: "rows", screen: "rows", ds: "§8.3", title: "ds.scr.rows", tokenGroups: [], components: ["SelectedCheck"] },
  { id: "haptics", screen: "haptics", ds: "§15.6", title: "ds.scr.haptics", tokenGroups: [], components: [] },
  { id: "brand", screen: "brand", ds: "§18.2", title: "ds.brand.title", tokenGroups: [], components: ["BrandMark", "BrandLogo", "BrandLaunch", "BrandWait", "BrandIntro"] },
  { id: "tokens-color", screen: "base", ds: "§3", title: "ds.sec.color", tokenGroups: ["themes", "statusIcon", "drawing"], components: [] },
  { id: "tokens-text", screen: "base", ds: "§4", title: "ds.sec.text", tokenGroups: ["font"], components: [] },
  { id: "tokens-layout", screen: "spacing", ds: "§5", title: "ds.sec.layout", tokenGroups: ["space", "spaceHalf", "radius", "size", "breakpoint", "layout", "z", "component"], components: [] },
  { id: "tokens-motion", screen: "motion", ds: "§14", title: "ds.sec.motion", tokenGroups: ["motion", "timing"], components: [] },
  { id: "proto-object", screen: "proto", ds: "§12.11", title: "ds.sec.protoObject", tokenGroups: [], components: ["ObjectHeader", "ObjectHeaderBar", "IconRow", "MainStep", "SummaryLine", "Collapsible", "AccessNote", "ViewSteps"] },
  // visual language v2 (docs/design/visual-v2.html, founder 21.11): the new parts and the v2 look of the old ones
  { id: "proto-v2", screen: "proto", ds: "§12.12", title: "ds.sec.protoV2", tokenGroups: ["rhythm"], components: ["CheckList", "NumberTrio", "FigureRow", "TimerLine", "IntervalPlate", "TimeSlot", "ProgressBar", "Segmented"] },
  { id: "proto-lists", screen: "proto", ds: "§12.11", title: "ds.sec.protoLists", tokenGroups: [], components: ["DayCell", "WeekStrip", "MonthHead", "DayStrip", "GroupedList", "ListGroup", "GroupRow", "StatTile", "StatGrid", "StatusPill", "NowCard"] },
  // поток Г: the five screen templates (src/ui/templates/*) and their shared parts, in their showcase frame
  { id: "proto-templates", screen: "proto", ds: "§12.11", title: "ds.sec.protoTemplates", tokenGroups: [], components: ["OverviewScreen", "ListScreen", "ObjectScreen", "EditorScreen", "CalendarScreen", "CreateButton", "MoreButton", "ConfirmSheet", "HeaderIcons", "HeaderIcon", "HeaderButton", "HeaderBar", "HeaderBig", "HeaderAvatar", "HeaderBack", "HeaderClose", "HeaderPlate", "HeaderFade", "HeaderScroll", "HeaderStill", "SheetHead", "DemoPlate", "DemoDot", "TemplateFrame"] },
  { id: "graphite", screen: "graphite", ds: "§25", title: "ds.gr.title", tokenGroups: [], components: [] },
  { id: "tokens-print", screen: "base", ds: "§19", title: "ds.sec.print", tokenGroups: ["print", "drawingPrint", "shopSheet"], components: [] },
];

/**
 * Components of src/ui/** that are not (yet) shown. Shrinks to nothing when the showcase PRs B and C land (#1093):
 * the guard fails on a component that is neither in a section, nor here, nor in UI_NOT_SHOWN.
 */
export const UI_PENDING: readonly string[] = [
  "Columns", "Meter", "ReadOnly", "StatusChip", "TagChip", "Avatar", "MetaTag", "Steps",
  "Stepper", "ChoiceChips", "MultiChips", "FilterBar", "FilterRow", "HintsProvider", "ListCard", "CardGrid", "ListCardHeader", "StatusPicker",
  "ListPanel", "Glass", "Menu", "T", "Icon", "Card", "RowView", "Grid", "SectionTitle", "ListRow", "CardList",
  "Divider", "Empty", "Screen",
  // #2350: the row swipe has no gesture on the web (the showcase runs there too); seen on the phone in Клиенты / Задачи / Сметы
  "SwipeRow",
];

/** components that are plumbing, not something a person sees — each with the reason */
export const UI_NOT_SHOWN: Record<string, string> = {
  "OneColumn": "a context, not a component: the 360 panel makes every CardGrid inside it one column (#1343) — seen as the client's panel at 1280, e2e 158",
  "Background": "the screen background under everything; seen on every sample",
  "ScreenScrollCtx": "context that lets a form scroll its screen to a wrong field; nothing to see",
  "FieldAnchor": "the place of a required field the screen draws itself (the scroll goes to it); nothing to see — its frame and words are FieldError / Anchored",
  "Scrim": "the dim layer of a sheet; seen in the sheet sample",
};
