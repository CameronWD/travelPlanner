import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { GoogleSignInButton, DevSignInButton } from "@/app/signin/signin-buttons";

/**
 * The signed-out front door (spec I1), from the kit's DLanding.jsx: the hero on
 * the left, the "Come on in" sign-in card on a teal panel on the right. Served
 * at "/" and reused by /signin (which adds the access-denied copy).
 *
 * Always light: the dark palette is keyed on `.dark` on <html>, and globals.css
 * re-declares the light tokens under [data-theme="light"], so this subtree
 * ignores the theme toggle.
 *
 * No email/magic-link form (the app has none) and no invite section: access is
 * by invitation, and the card says so.
 */
export function Landing({ accessDenied = false }: { accessDenied?: boolean }) {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  return (
    <main
      data-theme="light"
      className="light flex flex-1 flex-col bg-background text-foreground lg:grid lg:min-h-dvh lg:grid-cols-[1fr_440px]"
    >
      <section className="relative flex flex-col overflow-hidden px-6 py-8 lg:px-12 lg:pb-[300px]">
        <Logo size={30} />
        <h1 className="mt-12 max-w-[640px] font-display text-[56px] font-extrabold leading-[0.92] tracking-[-0.05em] lg:mt-16 lg:text-[88px]">
          Plan it with your people<span className="text-coral">.</span>
        </h1>
        <p className="mt-5 max-w-[480px] text-[17px] font-medium leading-[1.45] lg:text-[19px]">
          Stops, nights, trains and money in one place — shared with
          whoever&apos;s coming. Fork the plan when you disagree. Count sleeps,
          not days.
        </p>
        <div className="mt-7">
          <Button asChild size="lg">
            <Link href="/signin">Start a trip</Link>
          </Button>
        </div>

        {/* Sample cards: decoration only, desktop only. */}
        <div aria-hidden="true" className="absolute inset-x-12 -bottom-[30px] hidden h-[260px] lg:block">
          <Card
            tone="coral"
            shadow={4}
            radius="xl"
            className="absolute bottom-10 left-0 w-[300px] -rotate-5 p-5"
          >
            <Badge caps>Planning</Badge>
            <p className="mt-3 font-display text-2xl font-extrabold tracking-[-0.03em]">
              Japan in Autumn
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[64px] font-extrabold leading-none tracking-[-0.05em]">
                26
              </span>
              <span className="font-display text-[22px] font-extrabold leading-tight">
                sleeps
                <br />
                to go
              </span>
            </div>
          </Card>
          <Card
            tone="lilac"
            shadow={2}
            className="absolute bottom-[90px] left-[40%] w-[250px] rotate-3 p-4"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em]">
              Where you&apos;re staying
            </p>
            <p className="mt-1.5 font-display text-base font-extrabold">
              Kyoto · Machiya near Gion
            </p>
            <p className="text-xs font-semibold">4 nights</p>
            <Badge variant="teal" className="mt-2.5">
              paid ✓
            </Badge>
          </Card>
          <Badge
            variant="sun"
            className="absolute bottom-[30px] left-[44%] -rotate-7 px-3.5 py-2 text-xs shadow-hard-2"
          >
            → Shinkansen · Odawara 11:12
          </Badge>
          <Card
            tone="teal"
            className="absolute right-0 bottom-[70px] hidden w-[150px] rotate-6 p-3.5 xl:block"
          >
            <div className="flex gap-1.5">
              <span className="grid size-[26px] place-items-center rounded-full border-2 border-border bg-sun text-[10px] font-extrabold">
                JM
              </span>
              <span className="grid size-[26px] place-items-center rounded-full border-2 border-border bg-lilac text-[10px] font-extrabold">
                AL
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold">
              Jess forked
              <br />
              &ldquo;Slow Kyoto&rdquo;
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col justify-center gap-4 border-t-2 border-border bg-teal p-6 lg:border-t-0 lg:border-l-2 lg:p-10">
        <Card
          role="region"
          aria-labelledby="come-on-in"
          shadow={4}
          radius="xl"
          className="p-7"
        >
          <CardTitle id="come-on-in" className="text-[28px]">
            Come on in
          </CardTitle>

          {accessDenied ? (
            <div className="mt-2">
              <p className="font-display text-base font-extrabold">
                Teepee is invite-only.
              </p>
              {/*
                This copy is shown to everyone Auth.js refuses, and it has no
                idea which of them is reading it: a brand-new stranger, someone
                already waiting, someone who was dismissed, or someone whose
                access was revoked. It stays one neutral message — telling a
                reader which bucket they are in would turn this page into an
                oracle about the Admin's decisions (final fix wave, I2).
              */}
              <CardDescription className="mt-1">
                Your Google account isn&apos;t on the list. We&apos;ve recorded
                the attempt for the admin — there&apos;s nothing else to do
                here. This page can&apos;t tell you where a request stands, and
                not every request is granted; if you&apos;re expecting access,
                ask whoever invited you.
              </CardDescription>
            </div>
          ) : (
            <CardDescription className="mt-1.5">
              Teepee is invite-only — sign in with the Google account you were
              invited with.
            </CardDescription>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {googleConfigured && <GoogleSignInButton />}

            {!googleConfigured && !devLogin && (
              <p className="text-center text-sm text-muted-foreground">
                No sign-in method is configured yet. Add Google OAuth
                credentials (or enable dev login in development) to continue.
              </p>
            )}

            {devLogin && (
              <>
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  dev sign-in
                  <span className="h-px flex-1 bg-border" />
                </div>
                <DevSignInButton email="you@example.com" label="You" />
                <DevSignInButton email="partner@example.com" label="Partner" />
              </>
            )}
          </div>
        </Card>

        <nav
          aria-label="Legal"
          className="flex items-center justify-center gap-4 text-xs font-semibold text-on-accent"
        >
          <Link href="/privacy" className="tap-target underline underline-offset-2">
            Privacy
          </Link>
          <Link href="/terms" className="tap-target underline underline-offset-2">
            Terms
          </Link>
        </nav>
      </section>
    </main>
  );
}
