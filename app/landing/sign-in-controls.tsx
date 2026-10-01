import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";
import { EmailSignInForm } from "./email-sign-in";

/**
 * The working sign-in controls, shared by every mode of the Sign in panel —
 * the Landing's only sign-in surface (spec 2026-09-29 D4). Honest by
 * design: Google, the Sign-in link field when Resend is configured (spec
 * 2026-10-01 §B3), dev logins in development, and one line saying what is
 * still on the way — no disabled placeholders. The surrounding copy (invite
 * line, access-denied text) is each surface's own.
 *
 * Each method is gated on its own env — the same shape as lib/auth.ts, so a
 * deploy without the Resend vars shows no field and nothing else changes.
 */
function Divider() {
  return (
    <div className="my-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
      <span className="flex-1 border-t-2 border-dotted border-border-soft" />
      or
      <span className="flex-1 border-t-2 border-dotted border-border-soft" />
    </div>
  );
}

export function SignInControls({
  google = "outline",
  googleClassName,
  afterGoogle,
  callbackUrl,
}: {
  google?: "outline" | "secondary";
  googleClassName?: string;
  afterGoogle?: React.ReactNode;
  callbackUrl?: string;
}) {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const emailConfigured = Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM);
  const anyConfigured = googleConfigured || emailConfigured || devLogin;

  return (
    <div className="flex flex-col gap-3">
      {googleConfigured && <GoogleSignInButton variant={google} className={googleClassName} callbackUrl={callbackUrl} />}

      {!anyConfigured && (
        <p className="text-center text-sm text-muted-foreground">
          No sign-in method is configured yet. Add Google OAuth credentials or Resend sign-in link credentials (or enable dev login in development) to continue.
        </p>
      )}

      {afterGoogle}

      {/* One divider after Google, before whatever follows it. */}
      {googleConfigured && (emailConfigured || devLogin) && <Divider />}

      {emailConfigured && <EmailSignInForm callbackUrl={callbackUrl ?? "/trips"} />}

      {devLogin && (
        <>
          <DevSignInButton email="you@example.com" label="You" callbackUrl={callbackUrl} />
          <DevSignInButton email="partner@example.com" label="Partner" callbackUrl={callbackUrl} />
        </>
      )}

      <p className="text-center text-[13px] font-medium text-muted-foreground">
        Apple sign-in is on the way.
      </p>
    </div>
  );
}
