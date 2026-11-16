/**
 * «Получить код» (docs/specs/52 §8 Р10, #1756): a new account is made only by the server (the edge function
 * request-code — the email and nothing else), then Supabase Auth sends the code to an EXISTING account
 * (`shouldCreateUser: false`). Pure: the network calls come in, so test/requestCode.test.ts runs it with fakes.
 *
 * The function not answering (not deployed yet, the network, 5xx) is not a dead end: the app asks Auth the old way
 * (`shouldCreateUser: true`). While «Allow new users to sign up» is on that still works; once it is off (after this
 * build is out — spec 52 §10) Auth refuses a new address and the screen says so.
 */
export interface RequestCodeDeps {
  /** POST /functions/v1/request-code {email} → the HTTP status, or null when there was no answer */
  callFunction: (email: string) => Promise<number | null>;
  /** supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } }) → Auth's refusal, or null */
  otp: (email: string, shouldCreateUser: boolean) => Promise<string | null>;
}

/** the refusal for the screen (features/signIn.ts reads it), or null when the code went */
export async function requestCode(email: string, deps: RequestCodeDeps): Promise<string | null> {
  const status = await deps.callFunction(email).catch(() => null);
  // the function says the address is not one: Auth's own words for it
  if (status === 400) return `Email address "${email}" is invalid`;
  if (status === 200) return deps.otp(email, false);
  return deps.otp(email, true);
}
