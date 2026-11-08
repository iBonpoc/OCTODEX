/** Save a text file the user asked for (the import report CSV): the browser downloads it, the phone shares it. */
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function saveText(name: string, text: string, mimeType = "text/csv"): Promise<void> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: name });
}
