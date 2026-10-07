import type { Route } from "next";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Landing } from "./landing/landing";
import { isAccessDenied, isLinkExpired } from "./landing/access-denied";
import { safeCallbackPath, panelFromParam } from "@/lib/safe-callback";

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
 * (lib/auth.ts pages.error) — open the Landing's panel straight into denied
 * mode rather than making the visitor click Sign in again. A spent or
 * expired Sign-in link comes back as "/?error=Verification" and opens it in
 * link-expired mode.
 *
 * `?panel=` and `?callbackUrl=` come from a Share page (spec §E.2); `ref`/`t`
 * ride along for attribution and are not read here. Only a same-origin path
 * survives as callbackUrl (lib/safe-callback.ts) — a signed-in visitor is
 * redirected to it, so it must never point off-site.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; callbackUrl?: string | string[]; panel?: string | string[] }>;
}) {
  const { error, callbackUrl, panel } = await searchParams;
  const next = safeCallbackPath(callbackUrl);
  const session = await auth();
  if (
    session?.user?.id &&
    (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))
  ) {
    redirect((next ?? "/trips") as Route);
  }
  return (
    <Landing
      accessDenied={isAccessDenied(error)}
      linkExpired={isLinkExpired(error)}
      initialPanel={panelFromParam(panel)}
      callbackUrl={next}
    />
  );
}
