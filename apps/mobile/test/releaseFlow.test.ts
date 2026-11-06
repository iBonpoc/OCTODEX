/**
 * releaseFlow — the release never waits for an answer nobody gives (docs/ai/CHECKS.md §3а; «Каркас» №5, 06.11).
 * Supabase CLI 3.x: «hosted changes only accept --yes or SUPABASE_YES exported in your shell» — without it a command
 * that changes the hosted project stops at a prompt, and the release fails (after #214 `functions deploy` did, and the
 * app was not published until #226). Static: every `supabase <cmd>` in .github/workflows that changes the hosted project
 * carries `--yes`, or SUPABASE_YES is set for the workflow / job / step.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
/** subcommands that change the hosted project (supabase <cmd> --help: «hosted changes only accept this flag») */
export const HOSTED_CHANGES: readonly RegExp[] = [
  /\bsupabase\s+db\s+push\b/, /\bsupabase\s+functions\s+(deploy|delete)\b/, /\bsupabase\s+migration\s+repair\b/,
  /\bsupabase\s+secrets\s+(set|unset)\b/, /\bsupabase\s+db\s+reset\b[^\n]*--linked/, /\bsupabase\s+config\s+push\b/,
  /\bsupabase\s+storage\s+(rm|mv|cp)\b/, /\bsupabase\s+branches\s+(create|delete|update)\b/,
];
/** the lines of a workflow with a hosted change and no way to say «yes» */
export function promptingCommands(yml: string): string[] {
  const yesEnv = /SUPABASE_YES\s*:\s*["']?(1|true|yes)["']?/i.test(yml);
  if (yesEnv) return [];
  return yml
    .split("\n")
    .map((l, i) => ({ l: l.replace(/#.*$/, ""), n: i + 1 }))
    .filter(({ l }) => HOSTED_CHANGES.some((re) => re.test(l)) && !/(^|\s)(--yes|-y)(\s|$)/.test(l))
    .map(({ l, n }) => `line ${n}: ${l.trim()}`);
}

describe("releaseFlow — the rule (fixtures must fail)", () => {
  it("a hosted change without --yes stops at a prompt", () => {
    expect(promptingCommands('      - run: supabase functions deploy delete-account --project-ref "$P"')).toHaveLength(1);
    expect(promptingCommands("      - run: supabase db push --remote")).toHaveLength(1);
  });
  it("with --yes, or SUPABASE_YES in the env, or a read-only command — fine", () => {
    expect(promptingCommands('      - run: supabase functions deploy x --project-ref "$P" --yes')).toEqual([]);
    expect(promptingCommands("    env:\n      SUPABASE_YES: 'true'\n    steps:\n      - run: supabase db push --remote")).toEqual([]);
    expect(promptingCommands('      - run: supabase migration list --remote\n      - run: supabase link --project-ref "$P"')).toEqual([]);
    expect(promptingCommands("      # supabase db push --remote (a comment)")).toEqual([]);
  });
});

describe("releaseFlow — the workflows of this repository", () => {
  const dir = path.join(ROOT, ".github/workflows");
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    it(f, () => {
      expect(promptingCommands(fs.readFileSync(path.join(dir, f), "utf8")), `${f}: a hosted change without --yes / SUPABASE_YES`).toEqual([]);
    });
  }
});
