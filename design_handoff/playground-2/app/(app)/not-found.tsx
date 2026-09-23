import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/** Server Component. 404 for the app segment (also the "not a member" case — never reveal the trip exists). */
export default function AppNotFound() {
  return (
    <ErrorPanel
      kind="not-found"
      title="Nothing here"
      description="This page doesn’t exist, or you don’t have access to it."
      actions={<Button asChild><Link href="/trips">Back to trips</Link></Button>}
    />
  );
}
