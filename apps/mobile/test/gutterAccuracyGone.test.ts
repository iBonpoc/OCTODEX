/**
 * #768, #1764 (founder 16.11: «этой надписи не должно быть»; «вообще ничего не пишем»): nothing is written about how a
 * measurement was taken — no «замер примерный / перемерьте рулеткой / можно резать», no «Рулетка / Примерно» chip or
 * choice — on the canvas, the card, the corner, the sheet's stamp, the PDF or the client's page. The field `accuracy`
 * stays in the data (rule 16) and nothing shows it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const SRC = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk(SRC);

const WORDS: Record<string, RegExp> = {
  ru: /промер|перемер|можно резать|по спутнику|замер примерн|рулеткой|примерно —/i,
  en: /re-?measure|measure again|ok to cut|can cut|rough measure|by satellite|taped length/i,
  es: /vuelva a medir|se puede cortar|por satélite|medición aproximada|con cinta/i,
};

describe("#768 #1764 nothing about how it was measured", () => {
  it("no app string of the module says it", () => {
    for (const [lang, dict] of [["ru", ru], ["en", en], ["es", es]] as const) {
      const hits = Object.entries(dict as Record<string, string>).filter(([k, v]) => k.startsWith("mod.gutters.") && WORDS[lang]!.test(v)).map(([k]) => k);
      expect(hits, lang).toEqual([]);
    }
  });
  it("no screen shows the accuracy: the old keys and the old places are gone", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/mod\.gutters\.(draw\.acc[A-Z]\w*|card\.(tape|rough)|sheet\.tape|view\.rough)\b|testID="(view-rough|view-accuracy|view-accuracy-pick|corner-cut-rough|draw-accuracy-pick|draw-accuracy-hint)"/.test(src)) bad.push(relative(SRC, f));
    }
    expect(bad).toEqual([]);
  });
});
