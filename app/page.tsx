import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Landing } from "./landing/landing";
import { isAccessDenied } from "./landing/access-denied";

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
 * mode rather than making the visitor click Sign in again.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await auth();
  if (
    session?.user?.id &&
    (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))
  ) {
    redirect("/trips");
  }
  const { error } = await searchParams;
  return <Landing accessDenied={isAccessDenied(error)} />;
}
