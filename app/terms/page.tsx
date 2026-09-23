import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms · TEEPEE",
  description: "What TEEPEE is, and the terms of using it.",
};

/**
 * Public and unauthenticated, same reasoning as app/privacy/page.tsx — the
 * OAuth consent screen links here, for people who can't yet sign in.
 */
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Link
            href="/signin"
            className="flex items-center gap-1.5 font-display text-lg font-semibold text-foreground"
          >
            <span aria-hidden="true">🛖</span>
            TEEPEE
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Terms
            </h1>
            <p className="text-sm text-muted-foreground">
              What TEEPEE honestly is, in place of a document neither side
              needs pretending it is something bigger.
            </p>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              What this is
            </h2>
            <p className="text-sm text-muted-foreground">
              TEEPEE is a personal project: a trip planner built and run by
              one operator (the Admin) for a small, invite-only group of
              Travellers. It is not a company, not a commercial service, and
              not something with a support team behind it — it is software
              one person maintains for people they know.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              No warranty
            </h2>
            <p className="text-sm text-muted-foreground">
              TEEPEE is provided as-is, without warranty of any kind. It is
              built carefully and backed up nightly, but nothing about it is
              guaranteed — not uptime, not that a feature keeps working the
              way it does today, not that data is never lost. Do not rely on
              it as the only copy of anything that matters to you.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Access can be revoked
            </h2>
            <p className="text-sm text-muted-foreground">
              Being invited to TEEPEE does not entitle you to keep using it.
              The Admin can revoke access at any time, for any reason or no
              reason, without notice.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              What you upload
            </h2>
            <p className="text-sm text-muted-foreground">
              Do not upload anything you do not have the right to — files,
              images, or anything else. You are responsible for what you put
              into your Trips.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Questions
            </h2>
            <p className="text-sm text-muted-foreground">
              See the{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>{" "}
              page for what TEEPEE collects and keeps. For anything else,
              ask the Admin.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
