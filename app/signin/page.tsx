import { SignInScreen } from "./sign-in-screen";

export const metadata = {
  title: "Sign in",
};

/**
 * /signin is the kit's Sign in screen (spec 2026-09-29 §1.3), with the
 * access-denied copy in place of the invite hint when Auth.js refused the
 * account (?error=AccessDenied). Auth.js is configured with pages.signIn and
 * pages.error both set to "/signin" (lib/auth.ts).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const accessDenied = Array.isArray(error)
    ? error.includes("AccessDenied")
    : error === "AccessDenied";

  return <SignInScreen accessDenied={accessDenied} />;
}
