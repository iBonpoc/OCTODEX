/**
 * Build number shown in the header of every screen (founder: "so we know which version is new").
 * RULE (#733): never set it in a PR — it stays 0 here («dev» in the header: a local build). The build writes the number:
 * release.yml — the merged PR's number, preview.yml — the PR's number, eas-build.yml — the PR of main's last commit
 * (scripts/setBuild.cjs). test/buildNumber.test.ts is red when a PR changes it.
 */
export const BUILD = 0;
/**
 * The moment the build was made (ISO UTC), written by the same script as BUILD (#1506): the header shows it on the web and in a native
 * build before its first update. Always "" in the repository (a local build shows no date); test/buildNumber.test.ts guards it.
 */
export const BUILT_AT = "";
