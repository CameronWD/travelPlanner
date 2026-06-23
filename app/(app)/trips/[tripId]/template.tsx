import { PageTransition } from "@/components/ui/page-transition";

/**
 * Re-mounts on every navigation within a trip, giving each sub-page an
 * enter transition. The trip header + nav live in layout.tsx and persist.
 */
export default function TripTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
