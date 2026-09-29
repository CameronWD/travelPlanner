import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";

/**
 * The working sign-in controls, shared by the Sign in panel and the Sign in
 * screen (spec 2026-09-29 D4). Honest by design:
 * Google (the only real method), dev logins in development, and one line
 * saying what is on the way — no email field, no Apple button, no disabled
 * placeholders. The surrounding copy (invite line, access-denied text) is
 * each surface's own.
 */
export function SignInControls({
  google = "outline",
  googleClassName,
  afterGoogle,
}: {
  google?: "outline" | "secondary";
  googleClassName?: string;
  afterGoogle?: React.ReactNode;
}) {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex flex-col gap-3">
      {googleConfigured && <GoogleSignInButton variant={google} className={googleClassName} />}

      {!googleConfigured && !devLogin && (
        <p className="text-center text-sm text-muted-foreground">
          No sign-in method is configured yet. Add Google OAuth credentials (or enable dev login in development) to continue.
        </p>
      )}

      {afterGoogle}

      {devLogin && (
        <>
          {googleConfigured && (
            <div className="my-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <span className="flex-1 border-t-2 border-dotted border-border-soft" />
              or
              <span className="flex-1 border-t-2 border-dotted border-border-soft" />
            </div>
          )}
          <DevSignInButton email="you@example.com" label="You" />
          <DevSignInButton email="partner@example.com" label="Partner" />
        </>
      )}

      <p className="text-center text-[13px] font-medium text-muted-foreground">
        Email and Apple sign-in are on the way.
      </p>
    </div>
  );
}
