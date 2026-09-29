import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { SignInControls } from "@/app/landing/sign-in-controls";
import { entrance } from "@/app/landing/sample-cards";

/**
 * The Sign in page (spec 2026-09-29 §1.3), from the kit's SignIn screen:
 * Google-only and invite-aware. "Start a trip" and the Landing's "Sign in"
 * land here. Light mode forced, like the Landing.
 *
 * The access-denied copy is shown to everyone Auth.js refuses and has no idea
 * which of them is reading it: a brand-new stranger, someone already waiting,
 * someone dismissed, or someone revoked. It stays one neutral message —
 * telling a reader which bucket they are in would turn this page into an
 * oracle about the Admin's decisions (2026-09-26 final fix wave, I2).
 */
export function SignInScreen({ accessDenied }: { accessDenied: boolean }) {
  return (
    <main data-theme="light" className="light grid min-h-dvh flex-1 grid-cols-1 bg-background text-foreground lg:grid-cols-2">
      <section className="flex flex-col justify-center gap-[18px] px-6 py-8 lg:p-14">
        <Logo size={32} className="hidden lg:inline-flex" />
        <Logo size={26} className="lg:hidden" />
        <h1 className="font-display text-[44px] font-extrabold leading-[0.92] tracking-[-0.05em] lg:text-[64px]">
          Plan it with your people<span className="text-coral">.</span>
        </h1>
        <p className="max-w-[380px] text-[15px] font-semibold leading-[1.4]">
          One trip, everyone on it. Stops, days, money and the Wishlist.
        </p>

        {accessDenied ? (
          <div className="max-w-[420px]">
            <p className="font-display text-base font-extrabold">Teepee is invite-only.</p>
            <p className="mt-1 text-[13px] font-medium text-muted-foreground">
              Your Google account isn&apos;t on the list. We&apos;ve recorded the attempt for the admin — there&apos;s nothing else to do here. This page can&apos;t tell you where a request stands, and not every request is granted; if you&apos;re expecting access, ask whoever invited you.
            </p>
          </div>
        ) : null}

        <div className="max-w-[420px]">
          <SignInControls google="secondary" googleClassName="lg:w-auto lg:self-start" />
        </div>

        {accessDenied ? null : (
          <p className="max-w-[380px] text-[13px] font-medium text-muted-foreground">
            Got an invite? Sign in with the email it was sent to and the trip will be waiting.
          </p>
        )}

        <nav aria-label="Legal" className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
          <Link href="/privacy" className="tap-target underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="tap-target underline underline-offset-2">Terms</Link>
        </nav>
      </section>

      <section aria-hidden="true" className="hidden border-l-2 border-border bg-sun p-10 lg:grid lg:place-items-center">
        <Card tone="coral" shadow={5} radius="xl" className="tp-card-in w-[360px] p-7" style={entrance(-3, 0)}>
          <Badge caps>19 sleeps</Badge>
          <p className="mt-[22px] font-display text-[40px] font-extrabold leading-[1] tracking-[-0.04em]">Japan in Autumn</p>
          <p className="mt-1.5 text-[15px] font-semibold">12 – 24 Oct · 4 stops</p>
        </Card>
      </section>
    </main>
  );
}
