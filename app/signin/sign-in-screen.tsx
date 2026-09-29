import { Logo } from "@/components/ui/logo";
import { SignInControls } from "@/app/landing/sign-in-controls";
import { CollageCards } from "@/app/landing/sample-cards";
import { LegalNav } from "@/app/landing/landing";

/**
 * The Sign in page (spec 2026-09-29 §1.3), from the kit's SignIn screen:
 * Google-only and invite-aware. Reached via Auth.js's `pages.signIn` /
 * `pages.error` and deep links — not from the Landing's "Sign in", which now
 * opens the Sign in panel instead of navigating here. Light mode forced,
 * like the Landing. The desktop right panel shows the same nine-card
 * collage as the Landing.
 *
 * The access-denied copy is shown to everyone Auth.js refuses and has no idea
 * which of them is reading it: a brand-new stranger, someone already waiting,
 * someone dismissed, or someone revoked. It stays one neutral message —
 * telling a reader which bucket they are in would turn this page into an
 * oracle about the Admin's decisions (2026-09-26 final fix wave, I2).
 */
function AccessDeniedCopy() {
  return (
    <>
      <p className="font-display text-base font-extrabold">Teepee is invite-only.</p>
      <p className="mt-1 text-[13px] font-medium text-muted-foreground">
        Your Google account isn&apos;t on the list. We&apos;ve recorded the attempt for the admin — there&apos;s nothing else to do here. This page can&apos;t tell you where a request stands, and not every request is granted; if you&apos;re expecting access, ask whoever invited you.
      </p>
    </>
  );
}

export function SignInScreen({ accessDenied }: { accessDenied: boolean }) {
  return (
    <main data-theme="light" className="light grid min-h-dvh flex-1 grid-cols-1 bg-background text-foreground lg:grid-cols-[1fr_0.8fr]">
      <section className="flex flex-col justify-center gap-[18px] px-6 py-8 lg:p-14">
        <Logo size={32} className="hidden lg:inline-flex" />
        <Logo size={26} className="lg:hidden" />
        <h1 className="font-display text-[44px] font-extrabold leading-[0.92] tracking-[-0.05em] lg:text-[64px]">
          Plan it with your people<span className="text-coral">.</span>
        </h1>
        <p className="max-w-[380px] text-[15px] font-semibold leading-[1.4]">
          One trip, everyone on it. Stops, days, money and the Wishlist.
        </p>

        <div className="max-w-[420px]">
          <SignInControls
            google="secondary"
            googleClassName="lg:w-auto lg:self-start"
            afterGoogle={
              accessDenied ? (
                <AccessDeniedCopy />
              ) : (
                <p className="max-w-[380px] text-[13px] font-medium text-muted-foreground">
                  Got an invite? Sign in with the email it was sent to and the trip will be waiting.
                </p>
              )
            }
          />
        </div>

        <LegalNav onAccent={false} />
      </section>

      <section aria-hidden="true" className="relative hidden overflow-hidden border-l-2 border-border bg-sun lg:block">
        <CollageCards />
      </section>
    </main>
  );
}
