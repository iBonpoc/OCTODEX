// ЧЕРНОВИК (#2093): шторка мастера «Клиента нет дома?» — новая подсказка «Офис увидит и свяжется с клиентом». Не для влития.
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { space } from "@octo/design-tokens";
import { Screen, Card, ListRow } from "@/ui/surfaces";
import { Sheet } from "@/ui/overlays";
import { Button, TextField } from "@/ui/controls";
import { T } from "@/ui/primitives";

export default function Q2093a() {
  const [note, setNote] = useState("");
  return (
    <>
      <Screen title="Выезд" subtitle="Sarah Mitchell · 8:30–10:30" back={() => router.back()}>
        <Card>
          <ListRow title="1420 Oak St, Pasadena, CA" subtitle="На месте с 8:34" chevron={false} />
        </Card>
      </Screen>
      <Sheet visible onClose={() => undefined} title="Клиента нет дома?">
        <View style={{ gap: space[3] }}>
          <T v="body" tone="mut">
            Выезд закроется. Офис увидит и свяжется с клиентом.
          </T>
          <T v="caption" tone="mut">
            Фото на месте — по желанию
          </T>
          <Button label="Добавить фото" icon="camera" variant="secondary" onPress={() => undefined} />
          <TextField type="note" label="Заметка — по желанию" placeholder="Например: оставил записку на двери" value={note} onChangeText={setNote} />
          <Button label="Отметить" icon="check" full onPress={() => undefined} />
          <Button label="Не отмечать" variant="secondary" full onPress={() => undefined} />
        </View>
      </Sheet>
    </>
  );
}
