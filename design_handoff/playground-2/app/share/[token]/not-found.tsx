import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Logo } from "@/components/ui/logo";

/** Server Component. Public (no auth). Shown for invalid, revoked or date-less share tokens. */
export default function ShareNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center px-5">
        <Logo size={22} />
      </header>
      <ErrorPanel
        kind="not-found"
        className="flex-1"
        title="This link has expired"
        description="The trip organiser turned this link off, or made a new one. Ask them to send it again."
        actions={<Button asChild variant="secondary"><Link href="/signin">Plan your own trip</Link></Button>}
      />
    </div>
  );
}
