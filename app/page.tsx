import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Landing } from "./landing/landing";

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
 */
export default async function RootPage() {
  const session = await auth();
  if (
    session?.user?.id &&
    (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))
  ) {
    redirect("/trips");
  }
  return <Landing />;
}
