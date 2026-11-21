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
import { Button } from "../controls";
import { HeaderButton, HeaderIcon } from "../headerIcon";
import { Menu, Sheet, type MenuItem } from "../overlays";
import { T } from "../primitives";
import { RowView } from "../surfaces";
import type { CreateAction, IconAction, MoreAction } from "./types";
import { asksFirst } from "./templateRules";
import type { HeaderKind } from "./headerMath";
import { HeaderAvatar, HeaderBack, HeaderBar, HeaderBig, HeaderClose, HeaderStill } from "./screenHeader";

type Anchor = { x: number; y: number; w: number; h: number };

/** a round header button that opens a Menu at itself */
function MenuButton({ icon, a11y, items, onSelect, testID }: { icon: "plus" | "more"; a11y: string; items: MenuItem<string>[]; onSelect: (k: string) => void; testID: string }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [at, setAt] = useState<Anchor | null>(null);
  return (
    <View ref={ref} collapsable={false} testID={testID}>
      {/* the one header's circle 40 (headerIcon.tsx HeaderButton) — «＋» and «⋯» look as every other control of the row */}
      <HeaderButton icon={icon} label={a11y} popup onPress={() => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }))} />
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
 * The showcase frame of a template (`preview`): the same one header (screenHeader.tsx) in the same places as on its Screen — the
 * row «←» / «×» / the avatar on the left, the icons · «＋» · «⋯» on the right, the big block (the 13 line + the 30 title, or «Имя |
 * две строки») — held open (the showcase's own scroll does not fold it), what stands under it, the content, the pinned bar at the
 * bottom. Only for the showcase: a real screen is the template's Screen.
 */
export function TemplateFrame({
  kind,
  title,
  kicker,
  avatar,
  sub,
  state,
  back,
  right,
  under,
  children,
  bottom,
  testID,
}: {
  kind: HeaderKind;
  title: string;
  kicker?: string;
  avatar?: { initials: string; onPress?: () => void; label: string };
  sub?: { line1?: string; line2?: ReactNode };
  state?: string;
  back?: () => void;
  right?: ReactNode;
  under?: ReactNode;
  children: ReactNode;
  bottom?: ReactNode;
  testID: string;
}) {
  const { c } = useTheme();
  const { t } = useI18n();
  const lead =
    kind === "editor" && back ? (
      <HeaderClose testID={`${testID}-back`} label={t("common.back")} onPress={back} />
    ) : back ? (
      <HeaderBack testID={`${testID}-back`} label={t("common.back")} onPress={back} />
    ) : avatar ? (
      <HeaderAvatar testID={`${testID}-avatar`} {...avatar} />
    ) : null;
  return (
    <HeaderStill kind={kind}>
      <View testID={testID} style={{ borderRadius: radius.card, borderWidth: component.hairline, borderColor: c.bd, backgroundColor: c.bg, overflow: "hidden" }}>
        <View style={{ padding: space[4], paddingTop: 0, gap: space[3] }}>
          <HeaderBar testID={`${testID}-head`} kind={kind} lead={lead} parent={kind === "object" && back ? { label: t("common.back"), onPress: back } : undefined} mini={title} state={state} right={right} />
          {kind === "editor" ? null : <HeaderBig kind={kind === "root" ? "root" : "object"} title={title} kicker={kicker} sub={sub} />}
          {under}
          {children}
        </View>
        {bottom}
      </View>
    </HeaderStill>
  );
}
