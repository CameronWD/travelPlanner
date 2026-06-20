import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";

/**
 * Derive initials from a display name (up to 2 chars).
 */
function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/**
 * App shell for all authenticated routes under (app).
 *
 * Keeps the server-side auth gate from the stub layout and adds:
 *   - A sticky top bar with the wordmark + theme toggle + traveller avatar dropdown
 *   - A centered, padded content area
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

  const { name, email, image } = session.user;

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Wordmark */}
          <Link
            href="/trips"
            className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight text-foreground hover:text-foreground/80 transition-colors"
            aria-label="Trip Planner — go to your trips"
          >
            <span aria-hidden="true">✈️</span>
            Trip Planner
          </Link>

          {/* Right-hand controls */}
          <div className="flex items-center gap-1">
            <ThemeToggle />

            {/* Traveller avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Open traveller menu"
              >
                <Avatar className="size-9">
                  {image ? (
                    <AvatarImage src={image} alt={name ?? "Traveller"} />
                  ) : null}
                  <AvatarFallback>{initials(name)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {name ?? "Traveller"}
                  </span>
                  {email ? (
                    <span className="text-xs text-muted-foreground">
                      {email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <SignOutMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Content area ── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
