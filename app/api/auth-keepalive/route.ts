import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { authServer } from "@/lib/auth/auth";

// A full page load renews the session row inside a Server Component, where
// Better Auth's cookie write is dropped. Here cookies can be written: read the
// row past the 5-minute cookie cache (renewing it if due), then re-issue the
// token cookie at the row's expiry ourselves, because when a page load already
// renewed the row today Better Auth writes no cookie at all.
export async function POST(request: NextRequest): Promise<Response> {
  const session = await authServer.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session) return new Response(null, { status: 401 });

  const { name, attributes } = (await authServer.$context).authCookies.sessionToken;
  const { sameSite, ...rest } = attributes;
  (await cookies()).set(name, request.cookies.get(name)!.value, {
    ...rest,
    sameSite: sameSite?.toLowerCase() as Lowercase<NonNullable<typeof sameSite>> | undefined,
    maxAge: Math.floor((session.session.expiresAt.getTime() - Date.now()) / 1000),
  });
  return new Response(null, { status: 204 });
}
