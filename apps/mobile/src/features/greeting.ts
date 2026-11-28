type HelloKey = "proto.home.hello.morning" | "proto.home.hello.day" | "proto.home.hello.evening";

/** «Доброе утро, Алекс»: the part of the company's day (`minute` of it) and the first name (Greeting, BUILD-SPEC §1).
 *  No name — no greeting (undefined): the 13 line over «Главная» is then only the date, not «… · Главная» (Д-шапка-4, #2922) */
export function greetingFor(fullName: string, minute: number, t: (k: HelloKey, p: { name: string }) => string): string | undefined {
  const name = fullName.trim().split(/\s+/)[0] ?? "";
  const key: HelloKey = minute < 12 * 60 ? "proto.home.hello.morning" : minute < 18 * 60 ? "proto.home.hello.day" : "proto.home.hello.evening";
  return name ? t(key, { name }) : undefined;
}
