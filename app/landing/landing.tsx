import { Logo } from "@/components/ui/logo";
import { SignInControls } from "./sign-in-controls";
import { SignInPanelProvider, LandingActions } from "./sign-in-panel";
import { CollageCards, PhoneSampleCards } from "./sample-cards";

/**
 * The Landing (CONTEXT.md "Landing"; spec 2026-09-29 collage): the signed-out
 * page at "/". Two trees from the kit, one displayed per breakpoint — the
 * desktop tree (hero + way in left, a nine-piece collage on a clipped sun
 * panel right) from lg, and the phone tree (hero, way in, sample cards
 * filling the rest of the screen) below it.
 *
 * The header is the logo alone. The way in (C2/C3): "Sign in" and "Request
 * access" under the hero open the same small SignInPanel — no "Come on in"
 * card and no sign-in sheet embedded in either tree. A refused Google sign-in
 * comes back here as "/?error=AccessDenied"; `accessDenied` opens that same
 * panel in denied mode on load.
 *
 * Always light: the dark palette is keyed on `.dark` on <html>, and
 * globals.css re-declares the light tokens under [data-theme="light"], so
 * this subtree ignores the theme toggle.
 */

export function Landing({ accessDenied = false }: { accessDenied?: boolean }) {
  return (
    <main data-theme="light" className="light flex flex-1 flex-col bg-background text-foreground">
      <SignInPanelProvider controls={<SignInControls />} initialMode={accessDenied ? "denied" : undefined}>
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

        {/* ── Phone, below lg: hero, way in, then cards to the bottom edge ── */}
        <div data-slot="landing-phone" className="flex h-dvh flex-col overflow-hidden px-6 lg:hidden">
          <div className="pt-3.5">
            <Logo size={26} />
          </div>
          <h1 className="pt-7 font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[300px] text-[15px] font-semibold leading-[1.4]">
            Stops, trains, beds and budget all in one place. For the trip you&apos;re dreaming up, the one you&apos;re on, and everywhere you&apos;ve been.
          </p>
          <div className="mt-5">
            <LandingActions size="md" />
          </div>
          <PhoneSampleCards />
        </div>
      </SignInPanelProvider>
    </main>
  );
}
