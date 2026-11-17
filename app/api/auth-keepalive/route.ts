import { cookies } from "next/headers";
import { authServer } from "@/lib/auth/auth";

/**
 * Keeps a signed-in browser's session cookie as long-lived as its session row.
 *
 * A full page load renews the row inside a Server Component, where Better Auth's
 * cookie write is silently dropped, so the browser's cookie keeps its old expiry
 * while the row moves on. A Route Handler can write cookies, so this one reads
 * the row past the cookie cache (renewing it if due, which writes the cookie
 * through nextCookies) and then re-issues the token cookie at the row's expiry
 * either way: when a page load already renewed the row today, Better Auth sees
 * nothing to do and writes no cookie at all.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await authServer.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session) return new Response(null, { status: 401 });

  const { name, attributes } = (await authServer.$context).authCookies.sessionToken;
  const { sameSite, ...rest } = attributes;
  const store = await cookies();
  store.set(name, store.get(name)!.value, {
    ...rest,
    sameSite: sameSite?.toLowerCase() as Lowercase<NonNullable<typeof sameSite>> | undefined,
    maxAge: Math.floor((session.session.expiresAt.getTime() - Date.now()) / 1000),
  });
  return new Response(null, { status: 204 });
}
