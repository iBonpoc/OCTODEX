/**
 * e2e 417 cloud — #1606 on a real Supabase: a person who signed in by a code has no name (the base keeps the e-mail instead,
 * handle_new_user), so the app asks «Как вас зовут?» once: the sheet, the name typed, «Сохранить» → public.users.full_name
 * (the column grant + users_update of the base); asked once — not again after a reload. The seeded a1 gets «no name» through the
 * service role first and his name back at the end.
 */
const { signIn, waitRows } = require("../signIn.cjs");

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  const setName = async (name) => {
    const r = await fetch(`${seed.url.replace(/\/$/, "")}/rest/v1/users?id=eq.${a1.userId}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ full_name: name }),
    });
    if (!r.ok) throw new Error(`set full_name: ${r.status} ${await r.text()}`);
  };
  const [before] = await waitRows(admin, `users?select=full_name&id=eq.${a1.userId}`, (r) => r.length === 1, "a1's row");
  const typed = `Dana ${Date.now().toString(36)}`;
  await setName(a1.email); // what a code sign-in leaves: the e-mail in place of a name
  try {
    await signIn(h, a1);
    const sheet = p.getByTestId("name-ask").locator("visible=true").first();
    await sheet.waitFor({ timeout: 20000 });
    await h.shot("ask");
    await p.getByTestId("name-ask-field").locator("visible=true").first().locator("input, textarea").first().fill(typed);
    await p.getByTestId("name-ask-save").locator("visible=true").first().click();
    const [row] = await waitRows(admin, `users?select=full_name&id=eq.${a1.userId}`, (r) => r.length === 1 && r[0].full_name === typed, "the typed name");
    h.expect(row.full_name === typed, `the name is on the server (${row.full_name})`);
    // asked once: not again
    await h.go("/today");
    await p.getByTestId("tab-bar").or(p.getByTestId("side-nav")).locator("visible=true").first().waitFor({ timeout: 20000 });
    h.expect((await p.getByTestId("name-ask").locator("visible=true").count()) === 0, "not asked again after a reload");
  } finally {
    await setName(before.full_name);
  }
};
