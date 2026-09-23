import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";

export const metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const accessDenied = Array.isArray(error)
    ? error.includes("AccessDenied")
    : error === "AccessDenied";

  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      {accessDenied && (
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <CardTitle className="font-display text-xl">
              Teepee is invite-only.
            </CardTitle>
            {/*
              This card is shown to everyone Auth.js refuses, and it has no
              idea which of them is reading it: a brand-new stranger, someone
              already waiting, someone who was dismissed, or someone whose
              access was revoked. The previous copy promised "you'll be able
              to sign in here once you're approved", which is false for the
              last two and leaks nothing useful to the first two. It stays one
              neutral message — telling a reader which bucket they are in
              would turn this page into an oracle about the Admin's decisions
              (final fix wave, I2).
            */}
            <CardDescription>
              Your Google account isn&apos;t on the list. We&apos;ve recorded
              the attempt for the admin — there&apos;s nothing else to do
              here. This page can&apos;t tell you where a request stands, and
              not every request is granted; if you&apos;re expecting access,
              ask whoever invited you.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo variant="mark" size={36} />
          <CardTitle className="font-display text-2xl">
            Welcome to Teepee
          </CardTitle>
          <CardDescription>
            A place to house your travel. Sign in to see your trips.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {googleConfigured && <GoogleSignInButton />}

          {!googleConfigured && !devLogin && (
            <p className="text-center text-sm text-muted-foreground">
              No sign-in method is configured yet. Add Google OAuth credentials
              (or enable dev login in development) to continue.
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
              <DevSignInButton
                email="partner@example.com"
                label="Partner"
              />
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
      </p>
    </main>
  );
}
