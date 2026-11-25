// ЧЕРНОВИК (#2093): после выбора нового времени — «Выезд перенесён» и «Сообщить клиенту новое время». Не для влития.
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Card, ListRow, SectionTitle } from "@/ui/surfaces";
import { Banner } from "@/ui/banner";
import { T } from "@/ui/primitives";

export default function Q2093c() {
  return (
    <Screen title="Выезд" subtitle="Sarah Mitchell · Seamless gutters" back={() => router.back()}>
      <Banner tone="ok" title="Выезд перенесён на Wed, Nov 26 · 10:00 AM" hint="Клиенту пока ничего не ушло" action={{ label: "Сообщить клиенту новое время", onPress: () => undefined }} />
      <Card>
        <ListRow title="Wed, Nov 26 · 10:00 AM – 12:00 PM" subtitle="Алекс Ривера · 1420 Oak St, Pasadena" chevron={false} />
      </Card>
      <SectionTitle title="Откроется «Сообщения» с текстом" />
      <Card inner>
        <View style={{ gap: space[1] }}>
          <T v="caption" tone="mut">Язык клиента — English</T>
          <T v="body">
            Hi Sarah, this is Bright Gutters. Our technician stopped by today but no one was home. Your new time is Wed, Nov 26, 10:00 AM – 12:00 PM. Reply to this message or call (626) 555-0100 to change it.
          </T>
        </View>
      </Card>
    </Screen>
  );
}
