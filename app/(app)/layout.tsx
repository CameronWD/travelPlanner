import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Auth gate for all routes under (app). Runs as a server component (Node
 * runtime, not edge) so Prisma is safe to use here. Unauthenticated visitors
 * are redirected to /signin.
 *
 * This is deliberately minimal — just the gate. The full app shell / nav is a
 * later task (WP0d).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return <>{children}</>;
}
