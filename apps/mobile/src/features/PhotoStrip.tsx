import { Image, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { radius, space, component } from "@octo/design-tokens";
import type { Photo } from "@/data/types";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, Press, T } from "@/ui/primitives";

const THUMB = 72;

/** Before/after photos. Camera on a phone; library/file picker on web. */
export function PhotoStrip({ photos, onAdd }: { photos: Photo[]; onAdd: (uri?: string) => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const pick = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const res =
      perm?.granted
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 }).catch(() => null)
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }).catch(() => null);
    if (!res || res.canceled) return;
    onAdd(res.assets[0]?.uri);
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
      <Press
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={t("visit.addPhoto")}
        style={{
          width: THUMB,
          height: THUMB,
          borderRadius: radius.inner,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: c.bd,
          backgroundColor: c.in,
          alignItems: "center",
          justifyContent: "center",
          gap: component.photoGap,
        }}
      >
        <Icon name="camera" s={20} />
        <T v="micro" tone="mut">
          {t("visit.addPhoto")}
        </T>
      </Press>
      {photos.map((p) => (
        <View
          key={p.id}
          style={{ width: THUMB, height: THUMB, borderRadius: radius.inner, overflow: "hidden", backgroundColor: c.surf2, alignItems: "center", justifyContent: "center" }}
        >
          {p.uri ? <Image source={{ uri: p.uri }} style={{ width: THUMB, height: THUMB }} /> : <Icon name="image" s={22} color={c.mut} />}
        </View>
      ))}
    </ScrollView>
  );
}
