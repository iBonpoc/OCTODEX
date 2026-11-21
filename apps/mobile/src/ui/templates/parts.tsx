/**
 * Shared parts of the five screen templates (BUILD-PLAN §1 поток Г): «＋» in the header (a Menu at the button — no floating «＋»,
 * no sheet), «⋯» (rare and dangerous steps; a dangerous one is red, last, and asks first in a sheet — rule 5), the «leave without
 * saving?» question of an editor, and the showcase frame that draws a template the way its Screen stands (the showcase is itself
 * a Screen; a Screen inside a Screen would nest two scrolls). All built from src/ui (Menu, Sheet, Button, IconButton) — nothing own.
 */
import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View } from "react-native";
import { component, radius, space } from "@octo/design-tokens";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, Button, IconButton } from "../controls";
import { HeaderIcon } from "../headerIcon";
import { Menu, Sheet, type MenuItem } from "../overlays";
import { Icon, Press, T } from "../primitives";
import { RowView } from "../surfaces";
import type { CreateAction, IconAction, MoreAction } from "./types";
import { asksFirst } from "./templateRules";

type Anchor = { x: number; y: number; w: number; h: number };

/** a round header button that opens a Menu at itself */
function MenuButton({ icon, a11y, items, onSelect, testID }: { icon: "plus" | "more"; a11y: string; items: MenuItem<string>[]; onSelect: (k: string) => void; testID: string }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<Anchor | null>(null);
  return (
    <View ref={ref} collapsable={false} testID={testID}>
      <IconButton icon={icon} label={a11y} onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))} />
      <Menu visible={!!at} anchor={at} items={items} onSelect={onSelect} onClose={() => setAt(null)} />
    </View>
  );
}

/** «＋» of the header: the CreateAction's Menu; the first item depends on the screen (BUILD-SPEC §1 HeaderActions) */
export function CreateButton({ create, onCreate, testID = "tpl-create" }: { create: CreateAction; onCreate: (key: string) => void; testID?: string }) {
  return <MenuButton icon="plus" a11y={create.a11y} items={create.items} onSelect={onCreate} testID={testID} />;
}

/** the yes / no sheet of a dangerous step or of leaving an editor: the danger button names the step, «Отмена» keeps things as they are */
export function ConfirmSheet({ ask, onClose }: { ask: { title: string; text: string; yes: string; onYes: () => void } | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet
      visible={!!ask}
      onClose={onClose}
      title={ask?.title}
      footer={
        <RowView gap={space[2]}>
          <View style={{ flex: 1 }}>
            <Button testID="tpl-confirm-no" label={t("common.cancel")} variant="secondary" full onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID="tpl-confirm-yes"
              label={ask?.yes ?? ""}
              variant="danger"
              full
              onPress={() => {
                const yes = ask?.onYes;
                onClose();
                yes?.();
              }}
            />
          </View>
        </RowView>
      }
    >
      <T v="body" tone="mut">
        {ask?.text ?? ""}
      </T>
    </Sheet>
  );
}

/** «⋯» of the header: always the last on the right; a `destructive` item asks in a sheet before it runs */
export function MoreButton({ items, onMore, a11y, testID = "tpl-more" }: { items: MoreAction; onMore: (key: string) => void; a11y?: string; testID?: string }) {
  const { t } = useI18n();
  const [ask, setAsk] = useState<{ title: string; text: string; yes: string; onYes: () => void } | null>(null);
  if (!items.length) return null;
  const pick = (k: string) => {
    const item = items.find((i) => i.key === k);
    if (asksFirst(item)) setAsk({ title: t("tpl.confirmTitle", { x: item!.label }), text: t("tpl.confirmText"), yes: item!.label, onYes: () => onMore(k) });
    else onMore(k);
  };
  return (
    <>
      <MenuButton icon="more" a11y={a11y ?? t("tpl.more")} items={items} onSelect={pick} testID={testID} />
      <ConfirmSheet ask={ask} onClose={() => setAsk(null)} />
    </>
  );
}

/** the round icons of the header (search, the bell) — the same look Screen gives `headerIcons` */
export function HeaderIcons({ icons }: { icons: IconAction[] }) {
  return (
    <>
      {icons.map((a) => (
        <HeaderIcon key={a.testID} action={a} />
      ))}
    </>
  );
}

/**
 * The showcase frame of a template (`preview`): the same parts in the same places as on its Screen — the header row «‹ назад» on
 * the left, the icons · «＋» · «⋯» on the right, the title (unless the template's own header names the object), what stands under
 * it, the content, and the pinned bar at the bottom. Only for the showcase: a real screen is the template's Screen.
 */
export function TemplateFrame({
  title,
  titleHidden,
  lead,
  back,
  right,
  under,
  children,
  bottom,
  testID,
}: {
  title: string;
  titleHidden?: boolean;
  /** the Overview's Greeting: stands where the title would (left of the icons) */
  lead?: ReactNode;
  back?: () => void;
  right?: ReactNode;
  under?: ReactNode;
  children: ReactNode;
  bottom?: ReactNode;
  testID: string;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <View testID={testID} style={{ borderRadius: radius.card, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.bg, overflow: "hidden" }}>
      <View style={{ padding: space[4], gap: space[3] }}>
        <RowView style={{ justifyContent: "space-between", gap: space[2] }}>
          {back ? (
            <Press onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} testID={`${testID}-back`} containerStyle={{ flexShrink: 1 }}>
              <RowView gap={space[1]}>
                <Icon name="chevronLeft" color={c.ink} />
                <T v="body" w="medium" numberOfLines={1}>
                  {t("common.back")}
                </T>
              </RowView>
            </Press>
          ) : lead ? (
            <View style={{ flex: 1, minWidth: 0 }}>{lead}</View>
          ) : (
            <T v="title" numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </T>
          )}
          <RowView gap={space[2]} style={{ flexShrink: 0 }}>
            {right}
          </RowView>
        </RowView>
        {back && !titleHidden ? (
          <T v="title" numberOfLines={2}>
            {title}
          </T>
        ) : null}
        {under}
        {children}
      </View>
      {bottom}
    </View>
  );
}

/**
 * Greeting — the head of an Overview (BUILD-SPEC §1 «Greeting»): the avatar 36 on the left (opens the «Ещё» sheet), «Доброе утро, Алекс»
 * 17 semibold in one line and the date 13 `mut` under it — instead of a 30 title, so the header icons on the right never wrap on 390.
 * testIDs: `<testID>`, `<testID>-avatar`.
 */
export function Greeting({ initials, text, date, onAvatar, avatarLabel, testID }: { initials: string; text: string; date: string; onAvatar?: () => void; avatarLabel: string; testID: string }) {
  const avatar = <Avatar initials={initials} s={component.avatar.md} />;
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minWidth: 0 }}>
      {onAvatar ? (
        <Press testID={`${testID}-avatar`} onPress={onAvatar} visibleHeight={component.avatar.md} accessibilityRole="button" accessibilityLabel={avatarLabel}>
          {avatar}
        </Press>
      ) : (
        avatar
      )}
      <View style={{ flex: 1, minWidth: 0 }} role="heading" aria-level={1}>
        <T v="heading" fit>
          {text}
        </T>
        <T v="caption" tone="mut" numberOfLines={1}>
          {date}
        </T>
      </View>
    </View>
  );
}
