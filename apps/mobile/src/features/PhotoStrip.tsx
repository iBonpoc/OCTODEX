import { useRef, useState, type ReactNode } from "react";
import { Image, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { liveUri, madeHere } from "./photoUri";
import { gridTile } from "./photoGrid";
import { prepPicked, type PickedPhoto } from "@/data/photoShrink";
import { canRetry, isPrepFail } from "@/data/photoUpload";
import { useStore } from "@/data/store";
import { StatusNote } from "@/ui/statusNote";
import { component, radius, size, space } from "@octo/design-tokens";
import type { Photo } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Button } from "@/ui/controls";
import { Sheet, useToast } from "@/ui/overlays";
import { ListRow } from "@/ui/surfaces";

const THUMB = component.photoThumb;

/** Before/after photos. Camera on a phone; library/file picker on web. Tap a photo to view it or delete it. */
export function PhotoStrip({ grid, photos, onAdd, onAddPreparing, onRemove, onRetry, onPrepare, title }: { /** #3076: the thumbnails wrap into rows (a grid, as iOS «Фото») instead of one strip that scrolls sideways — the client's «Фото и файлы» */ grid?: boolean; photos: Photo[]; /** none: the photos are only shown (no «Добавить фото» tile). Only a file made anew here (#1558) — never the original */ onAdd?: (uri: string, small?: true) => void; /** #1558: a photo that could not be made anew yet — kept on this phone as «preparing»; none: it is not added (a toast says to add it again) */ onAddPreparing?: (p: Extract<PickedPhoto, { preparing: unknown }>) => void; /** #1558 «Подготовить снова» on an «unreadable» photo (none: the store finds the visit by the photo) */ onPrepare?: (id: string) => void; onRemove?: (id: string) => void; /** #1431 «Повторить» on a photo the cloud did not take (its file is on this phone) */ onRetry?: (id: string) => void; /** the viewer's title when the photos are not a visit's before / after (a module's measurement) */ title?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const store = useStore();
  const prepareAgain = onPrepare ?? ((id: string) => store.preparePhotoAgain({ photoId: id }));
  const [opened, setOpen] = useState<Photo | null>(null);
  // #3076: in the grid the thumbnails fill the width — 4 in a row on a phone, more where `photoThumb` fits more (no new size: the
  // width is the container's, the least size is `photoThumb`)
  const [gridW, setGridW] = useState(0);
  const tile = grid && gridW ? gridTile(gridW) : THUMB;
  // a `blob:` of a page that is gone (web, after a reload) is shown as the picture sign, never loaded (an empty preview
  // and a console error otherwise)
  const shown = photos.map((p) => ({ ...p, uri: liveUri(p.uri) }));
  const open = opened ? { ...opened, uri: liveUri(opened.uri) } : null;
  // #1431: photos the cloud did not take — said under the strip (StatusNote) and, with the reason, in the viewer
  // #1558: a photo «preparing» is not a failure — it goes on its own (its own note, info)
  const failedList = shown.filter((p) => p.upload && p.upload.failed !== "preparing");
  const preparing = shown.filter((p) => p.upload?.failed === "preparing").length;
  const failed = failedList.length;
  const openFailed = open ? photos.find((p) => p.id === open.id)?.upload : undefined;
  // without a mark on the thumbnail the note is the way in: it opens the first refused photo, and the viewer pages through
  // the refused ones only (director 14.11, #1431 вариант А)
  const failedAt = open ? failedList.findIndex((p) => p.id === open.id) : -1;
  const nextFailed = failedAt >= 0 && failed > 1 ? failedList[(failedAt + 1) % failed] : undefined;
  // a second tap while the photo is being made smaller does nothing (no second picker, no photo twice)
  const busy = useRef(false);
  const pick = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await pickOne();
    } finally {
      busy.current = false;
    }
  };
  const pickOne = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const res =
      perm?.granted
        ? await ImagePicker.launchCameraAsync({ quality: 1 }).catch(() => null)
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    if (!res || res.canceled) return;
    // made anew once here, before the photo is kept and queued (#642); the original is never sent (#1558)
    const got = await prepPicked(res);
    if (!got) return;
    if ("uri" in got) {
      madeHere(got.uri);
      onAdd?.(got.uri, got.small);
    } else if (onAddPreparing) {
      madeHere(got.preparing.uri);
      onAddPreparing(got);
    } else toast.show(t("photoUp.prep.notAdded"));
  };
  return (
    <>
    <Strip grid={grid} onWidth={setGridW}>
      {onAdd ? (
        // the add tile (DS «Плитка добавления»): the size of a thumbnail, a one-line caption on every language, the frame
        // readable (≥ 3:1: `mut`), the icon never squeezed by a big font (the tile grows, not the icon shrinks)
        <Press
          onPress={pick}
          accessibilityRole="button"
          accessibilityLabel={t("visit.addPhoto")}
          testID="photo-add"
          style={{
            width: THUMB,
            minHeight: THUMB,
            paddingHorizontal: space[1],
            borderRadius: radius.inner,
            borderWidth: component.hairline,
            borderStyle: "dashed",
            borderColor: c.mut,
            backgroundColor: c.in,
            alignItems: "center",
            justifyContent: "center",
            gap: space[1],
          }}
        >
          <View style={{ flexShrink: 0 }}>
            <Icon name="camera" s={size.iconMd} color={c.mut} />
          </View>
          <T v="caption" tone="mut" center numberOfLines={1}>
            {t("photo.addShort")}
          </T>
        </Press>
      ) : null}
      {shown.map((p, i) => (
        <Press
          key={p.id}
          onPress={() => setOpen(p)}
          accessibilityRole="button"
          accessibilityLabel={`${title ?? (p.kind === "after" ? t("visit.photosAfter") : t("visit.photosBefore"))}, ${t("photo.nOf", { n: i + 1, total: shown.length })}${p.upload ? `, ${t(p.upload.failed === "preparing" ? "photoUp.prep.chip" : "photoUp.a11y")}` : ""}`}
          testID={`photo-thumb-${p.id}`}
          style={{ width: tile, height: tile, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
        >
          {p.uri ? <Image source={{ uri: p.uri }} style={{ width: tile, height: tile }} /> : <Icon name="image" s={size.iconLg} color={c.mut} />}
        </Press>
      ))}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={title ?? (open?.kind === "after" ? t("visit.photosAfter") : t("visit.photosBefore"))}>
        <View style={{ height: component.mediaH * 2, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}>
          {open?.uri ? (
            <Image source={{ uri: open.uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <Icon name="image" s={size.iconLg} color={c.mut} />
          )}
        </View>
        {open && openFailed?.failed === "preparing" ? (
          <StatusNote tone="info" v="body" testID="photo-prep-reason">
            {t("photoUp.prep.reason")}
          </StatusNote>
        ) : open && openFailed?.failed === "unreadable" ? (
          <StatusNote tone="warn" v="body" testID="photo-prep-unreadable">
            {t("photoUp.prep.unreadable")}
          </StatusNote>
        ) : open && openFailed && !isPrepFail(openFailed.failed) ? (
          <StatusNote tone="bad" v="body" testID="photo-upload-reason">
            {t(`photoUp.reason.${openFailed.failed}`)}
            {!open.uri && openFailed.failed !== "gone" ? ` ${t("photoUp.otherPhone")}` : ""}
          </StatusNote>
        ) : null}
        {/* the sheet's one main step (one filled accent, #2350): «Повторить», or «Подготовить снова» for «не открывается» — never both */}
        {open && ((onRetry && canRetry({ ...open, upload: openFailed })) || (openFailed?.failed === "unreadable" && open.uri)) ? (
          <Button
            label={t(openFailed?.failed === "unreadable" ? "photoUp.prep.again" : "photoUp.retry")}
            icon="cloudUp"
            full
            testID={openFailed?.failed === "unreadable" ? "photo-prep-again" : "photo-upload-retry"}
            onPress={() => {
              if (openFailed?.failed === "unreadable") prepareAgain(open.id);
              else onRetry?.(open.id);
              setOpen(null);
            }}
          />
        ) : null}
        {/* DS §7.5 (#3065): going to the next failed photo is a row «›» under the main step, not a third button; the sheet keeps one main + one second */}
        {nextFailed ? (
          <View testID="photo-upload-next">
            <ListRow title={t("photoUp.next", { i: failedAt + 1, n: failed })} left={<Icon name="image" />} onPress={() => setOpen(nextFailed)} />
          </View>
        ) : null}
        {onRemove && open ? (
          <Button
            label={t("photo.delete")}
            icon="trash"
            variant="secondary"
            full
            onPress={() => {
              onRemove(open.id);
              setOpen(null);
            }}
          />
        ) : null}
      </Sheet>
    </Strip>
    {preparing ? (
      <StatusNote tone="info" testID="photo-prep-strip">
        {t("photoUp.prep.strip", { n: preparing })}
      </StatusNote>
    ) : null}
    {failed ? (
      <Press
        onPress={() => setOpen(failedList[0]!)}
        accessibilityRole="button"
        accessibilityLabel={t("photoUp.strip", { n: failed })}
        visibleHeight={size.iconSm}
        testID="photo-upload-failed-open"
      >
        <StatusNote tone="bad" testID="photo-upload-failed">
          {t("photoUp.strip", { n: failed })}
        </StatusNote>
      </Press>
    ) : null}
    </>
  );
}

/** one strip that scrolls sideways, or (#3076) the same thumbnails wrapped into rows */
function Strip({ grid, onWidth, children }: { grid?: boolean; onWidth: (w: number) => void; children: ReactNode }) {
  return grid ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }} testID="photo-grid" onLayout={(e) => onWidth(e.nativeEvent.layout.width)}>
      {children}
    </View>
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
      {children}
    </ScrollView>
  );
}

