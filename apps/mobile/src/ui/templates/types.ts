/**
 * Shared types of the prototype v2 templates and their parts (docs/design/BUILD-PLAN.md §1, wave 1, поток А).
 * ObjectHeader, IconRow, MainStep (поток Б), DayStrip (поток В) and the five screen templates (поток Г) take these.
 */
import type { MenuItem } from "../overlays";
import type { StatusName } from "@octo/design-tokens";
import type { IconKey } from "../primitives";

/**
 * The one main step of a screen: a button (40, or 44 pinned at the bottom) and, if it is held back, the reason under / over it.
 * `outline` — the main one outlined (`secondary`) when the step is not about selling («Вернуть в активные», «Изменить смету»; BUILD-SPEC §1
 * MainStepBar «контурная») — still the one main step of the screen, only quieter.
 */
export type MainAction = { label: string; onPress: () => void; reason?: string; disabled?: boolean; outline?: boolean; testID: string };

/**
 * A round icon button (header icons, IconRow): `a11y` is required — the label names the object («Позвонить David Kim», П6).
 * `badge` — a count on the icon (the bell: unread; the sync: the offline queue): a status colour WITH the number (rule 2), «99+» past
 * 99, none at 0; the `a11y` says the number too («Уведомления, 3 новых»).
 */
export type IconAction = { icon: IconKey; a11y: string; onPress: () => void; testID: string; badge?: { n: number; tone?: StatusName } };

/** «＋» in the header: opens a Menu at the button (no floating «＋», no sheet). */
export type CreateAction = { a11y: string; items: MenuItem<string>[] };

/** «⋯»: rare and dangerous steps; a `destructive` item is red and last; the Menu asks before it. */
export type MoreAction = MenuItem<string>[];
