import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Landing } from "./landing/landing";

export const metadata: Metadata = {
  title: { absolute: "Teepee" },
};

/**
 * "/" is the signed-out front door (spec I1); a signed-in Traveller goes
 * straight to their trips. The landing forces light mode itself.
 */
export default async function RootPage() {
  const session = await auth();
  if (session?.user) redirect("/trips");
  return <Landing />;
}
