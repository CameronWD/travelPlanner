import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { SignInControls } from "./sign-in-controls";
import { DesktopSampleCards, PhoneSampleCards } from "./sample-cards";

/**
 * The Landing (CONTEXT.md "Landing"; spec 2026-09-29): the signed-out page at
 * "/". Two trees from the kit, one displayed per breakpoint — the desktop
 * DLanding (hero left, "Come on in" card on a sun panel right) from lg, and
 * the mobile Landing (hero, small card set, sign-in sheet) below it.
 *
 * Always light: the dark palette is keyed on `.dark` on <html>, and
 * globals.css re-declares the light tokens under [data-theme="light"], so
 * this subtree ignores the theme toggle.
 *
 * Honest sign-in (D4): only controls that work, plus one line saying what is
 * on the way. Access-denied copy lives on the Sign in screen, not here.
 */
const INVITE_LINE = "Teepee is invite-only — sign in with the Google account you were invited with.";
const LAST: CSSProperties = { "--tp-i": 5 } as CSSProperties;

function SignInLink({ size }: { size: "sm" | "md" }) {
  return (
    <Button asChild variant="secondary" size={size}>
      <Link href="/signin">Sign in</Link>
    </Button>
  );
}

function LegalNav({ onAccent }: { onAccent: boolean }) {
  return (
    <nav aria-label="Legal" className={`flex items-center justify-center gap-4 text-xs font-semibold ${onAccent ? "text-on-accent" : "text-muted-foreground"}`}>
      <Link href="/privacy" className="tap-target underline underline-offset-2">Privacy</Link>
      <Link href="/terms" className="tap-target underline underline-offset-2">Terms</Link>
    </nav>
  );
}

export function Landing() {
  return (
    <main data-theme="light" className="light flex flex-1 flex-col bg-background text-foreground">
      {/* ── Desktop (kit DLanding.jsx), from lg ── */}
      <div data-slot="landing-desktop" className="hidden lg:grid lg:min-h-dvh lg:grid-cols-[1fr_440px]">
        <section className="relative flex flex-col overflow-hidden px-12 py-8 pb-[300px]">
          <div className="flex items-center justify-between">
            <Logo size={30} />
            <SignInLink size="sm" />
          </div>
          <h1 className="mt-16 max-w-[640px] font-display text-[88px] font-extrabold leading-[0.92] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-[22px] max-w-[480px] text-[19px] font-semibold leading-[1.45]">
            Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming. Fork the plan when you disagree. Count sleeps, not days.
          </p>
          <div className="mt-7">
            <Button asChild size="lg">
              <Link href="/signin">Start a trip</Link>
            </Button>
          </div>
          <DesktopSampleCards />
        </section>

        <section className="flex flex-col justify-center gap-4 border-l-2 border-border bg-sun p-10">
          <Card role="region" aria-labelledby="come-on-in" shadow={4} radius="xl" className="tp-card-pop-in p-7" style={LAST}>
            <CardTitle id="come-on-in" className="text-[30px]">Come on in</CardTitle>
            <CardDescription className="mt-1.5">{INVITE_LINE}</CardDescription>
            <div className="mt-6">
              <SignInControls />
            </div>
          </Card>
          <LegalNav onAccent />
        </section>
      </div>

      {/* ── Phone (kit Landing.jsx), below lg ── */}
      <div data-slot="landing-phone" className="flex min-h-dvh flex-col lg:hidden">
        <div className="flex items-center justify-between px-6 pt-3.5">
          <Logo size={26} />
          <SignInLink size="sm" />
        </div>
        <div className="px-6 pt-7">
          <h1 className="font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[300px] text-[15px] font-semibold leading-[1.4]">
            Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming.
          </p>
          <PhoneSampleCards />
        </div>
        <section
          role="region"
          aria-labelledby="come-on-in-sheet"
          className="tp-card-pop-in mt-auto flex flex-col gap-3 rounded-t-2xl border-t-2 border-border bg-card px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          style={LAST}
        >
          <h2 id="come-on-in-sheet" className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]">Come on in</h2>
          <p className="text-[13px] font-medium text-muted-foreground">{INVITE_LINE}</p>
          <SignInControls />
          <LegalNav onAccent={false} />
        </section>
      </div>
    </main>
  );
}
