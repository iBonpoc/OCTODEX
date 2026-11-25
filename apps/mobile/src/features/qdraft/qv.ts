// ЧЕРНОВИК (#2549, не для влития): «как будет» для документа вопросов основателю. Вариант задаётся параметром адреса
// `?qv=<вариант>` (и `?store=1` и т. п.); без параметра экран — как в main. Параметр запоминается на вкладку браузера,
// чтобы переход внутри приложения (открыть шторку, перейти на экран) не терял вариант.
import { Platform } from "react-native";

function read(name: string): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const key = `qdraft.${name}`;
  const v = new URLSearchParams(window.location.search).get(name);
  try {
    if (v != null) window.sessionStorage.setItem(key, v);
    return v ?? window.sessionStorage.getItem(key);
  } catch {
    return v;
  }
}

/** the draft variant (`?qv=a`), or null — the screen as in main */
export const qv = (): string | null => read("qv");
/** another draft flag of the address (`?store=1`) */
export const qflag = (name: string): string | null => read(name);
