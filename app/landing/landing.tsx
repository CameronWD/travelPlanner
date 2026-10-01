import { Logo } from "@/components/ui/logo";
import { SignInControls } from "./sign-in-controls";
import { SignInPanelProvider, LandingActions } from "./sign-in-panel";
import { CollageCards, PhoneSampleCards } from "./sample-cards";

/**
 * The Landing (CONTEXT.md "Landing"; spec 2026-09-29 collage): the signed-out
 * page at "/". Two trees from the kit, one displayed per breakpoint — the
 * desktop tree (hero + way in left, a nine-piece card fan on a clipped sun
 * panel right) from lg, and the phone tree (centred hero, way in, a
 * five-piece card fan filling the rest of the screen) below it — handoff
 * design_handoff/landing-shuffle-handoff/LANDING.md.
 *
 * The header is the logo alone. The way in (C2/C3): "Sign in" and "Request
 * access" under the hero open the same small SignInPanel — no "Come on in"
 * card and no sign-in sheet embedded in either tree. A refused Google sign-in
 * comes back here as "/?error=AccessDenied"; `accessDenied` opens that same
 * panel in denied mode on load. A spent or expired Sign-in link (`linkExpired`)
 * opens the panel in link-expired mode. From a Share page, `initialPanel`
 * opens it in that mode instead, with precedence denied > link-expired >
 * initialPanel, and `callbackUrl` — already checked same-origin by the
 * page — rides on the sign-in buttons.
 *
 * Always light: the dark palette is keyed on `.dark` on <html>, and
 * globals.css re-declares the light tokens under [data-theme="light"], so
 * this subtree ignores the theme toggle.
 */

export function Landing({
  accessDenied = false,
  linkExpired = false,
  initialPanel,
  callbackUrl,
}: {
  accessDenied?: boolean;
  /** `/?error=Verification`: a spent or expired Sign-in link (spec 2026-10-01 §B3). */
  linkExpired?: boolean;
  initialPanel?: "sign-in" | "request";
  callbackUrl?: string | null;
}) {
  return (
    <main data-theme="light" className="light flex flex-1 flex-col bg-background text-foreground">
      <SignInPanelProvider
        controls={<SignInControls callbackUrl={callbackUrl ?? undefined} />}
        initialMode={accessDenied ? "denied" : linkExpired ? "link-expired" : initialPanel}
      >
        {/* ── Desktop, from lg: hero + way in left, collage right ── */}
        <div data-slot="landing-desktop" className="hidden lg:grid lg:min-h-dvh lg:grid-cols-[1fr_0.8fr]">
          <section className="flex flex-col px-12 py-8">
            <Logo size={30} />
            <div className="flex flex-1 flex-col justify-center py-10">
              <h1 className="max-w-[640px] font-display text-[88px] font-extrabold leading-[0.92] tracking-[-0.05em]">
                Plan it with your people<span className="text-coral">.</span>
              </h1>
              <p className="mt-[22px] max-w-[480px] text-[19px] font-semibold leading-[1.45]">
                Stops, trains, beds and budget all in one place. For the trip you&apos;re dreaming up, the one you&apos;re on, and everywhere you&apos;ve been.
              </p>
              <div className="mt-7">
                <LandingActions size="lg" />
              </div>
            </div>
          </section>
          <section className="relative overflow-hidden border-l-2 border-border bg-sun">
            <CollageCards />
          </section>
        </div>

        {/* ── Phone, below lg: centred hero, way in, then the card fan ── */}
        <div data-slot="landing-phone" className="flex h-dvh flex-col items-center overflow-hidden px-6 text-center lg:hidden">
          <div className="pt-3.5">
            <Logo size={26} />
          </div>
          <h1 className="pt-7 font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em] text-balance">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[310px] text-[15px] font-semibold leading-[1.4] text-balance">
            Stops, trains, beds and budget all in one place. For the trip you&apos;re dreaming up, the one you&apos;re on, and everywhere you&apos;ve been.
          </p>
          <div className="mt-5 self-stretch">
            <LandingActions size="md" align="center" />
          </div>
          <PhoneSampleCards />
        </div>
      </SignInPanelProvider>
    </main>
  );
}
