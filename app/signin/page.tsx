import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";

export const metadata = {
  title: "Sign in · TEEPEE",
};

export default function SignInPage() {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="text-3xl" aria-hidden="true">
            🛖
          </span>
          <CardTitle className="font-display text-2xl">
            Welcome to TEEPEE
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
    </main>
  );
}
