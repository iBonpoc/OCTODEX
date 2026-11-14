import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { liveUri, madeHere } from "./photoUri";
import { shrinkPicked } from "@/data/photoShrink";
import { component, radius, size, space } from "@octo/design-tokens";
import type { Photo } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";
import { Button } from "@/ui/controls";
import { Sheet } from "@/ui/overlays";

const THUMB = component.photoThumb;

/** Before/after photos. Camera on a phone; library/file picker on web. Tap a photo to view it or delete it. */
export function PhotoStrip({ photos, onAdd, onRemove, title }: { photos: Photo[]; /** none: the photos are only shown (no «Добавить фото» tile) */ onAdd?: (uri?: string) => void; onRemove?: (id: string) => void; /** the viewer's title when the photos are not a visit's before / after (a module's measurement) */ title?: string }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const [opened, setOpen] = useState<Photo | null>(null);
  // a `blob:` of a page that is gone (web, after a reload) is shown as the picture sign, never loaded (an empty preview
  // and a console error otherwise)
  const shown = photos.map((p) => ({ ...p, uri: liveUri(p.uri) }));
  const open = opened ? { ...opened, uri: liveUri(opened.uri) } : null;
  const pick = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const res =
      perm?.granted
        ? await ImagePicker.launchCameraAsync({ quality: 1 }).catch(() => null)
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }).catch(() => null);
    if (!res || res.canceled) return;
    // made smaller once here, before the photo is kept and queued (#642)
    const uri = await shrinkPicked(res);
    madeHere(uri);
    onAdd?.(uri);
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
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
          accessibilityLabel={`${title ?? (p.kind === "after" ? t("visit.photosAfter") : t("visit.photosBefore"))}, ${t("photo.nOf", { n: i + 1, total: shown.length })}`}
          testID={`photo-thumb-${p.id}`}
          style={{ width: THUMB, height: THUMB, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
        >
          {p.uri ? <Image source={{ uri: p.uri }} style={{ width: THUMB, height: THUMB }} /> : <Icon name="image" s={size.iconLg} color={c.mut} />}
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
    </ScrollView>
  );
}
