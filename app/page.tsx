import type { Route } from "next";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, authServer } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { Landing } from "./landing/landing";
import { isAccessDenied, isLinkExpired } from "./landing/access-denied";
import { safeCallbackPath, panelFromParam } from "@/lib/safe-callback";
import { oauthContinuation, toSearchParams, type SearchParamsRecord } from "@/lib/oauth-continuation";

export const metadata: Metadata = {
  title: { absolute: "Teepee" },
};

/**
 * "/" is the signed-out front door (spec I1) — and, since the Sign in page
 * folded into the Landing, also where every signed-out visitor is sent to
 * sign in. A signed-in Traveller goes straight to their trips. The landing
 * forces light mode itself.
 *
 * Only a session whose user row still exists goes on to /trips: the (app)
 * layout sends a session with no row back here, so bouncing it again would
 * loop.
 *
 * A refused Google sign-in comes back here as "/?error=AccessDenied"
 * (lib/auth/auth.ts pages.error) — open the Landing's panel straight into denied
 * mode rather than making the visitor click Sign in again. A spent or
 * expired Sign-in link comes back as "/?error=Verification" and opens it in
 * link-expired mode.
 *
 * `?panel=` and `?callbackUrl=` come from a Share page (spec §E.2); `ref`/`t`
 * ride along for attribution and are not read here. Only a same-origin path
 * survives as callbackUrl (lib/safe-callback.ts) — a signed-in visitor is
 * redirected to it, so it must never point off-site.
 *
 * Claude's sign-in (ADR 0071) also lands here: the OAuth provider sends a
 * signed-out Traveller to "/" with the authorise request in a signed query.
 * Then every sign-in returns into that request (lib/oauth-continuation.ts),
 * the panel opens on sign-in, and a signed-in Traveller goes straight back.
 * An expired signature is re-issued by sending the request round again: the
 * auth client posts the query with every sign-in, and the server refuses a
 * stale one.
 */
export default async function RootPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const { error, callbackUrl, panel } = params;
  const oauth = await oauthContinuation(toSearchParams(params), (await authServer.$context).secret);
  const next = oauth?.path ?? safeCallbackPath(callbackUrl);
  const session = await auth();
  if (
    session?.user?.id &&
    (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))
  ) {
    redirect((next ?? "/trips") as Route);
  }
  if (oauth && !oauth.verified) redirect(oauth.path as Route);
  return (
    <Landing
      accessDenied={isAccessDenied(error)}
      linkExpired={isLinkExpired(error)}
      initialPanel={oauth ? "sign-in" : panelFromParam(panel)}
      callbackUrl={next}
    />
  );
}
