import { Landing } from "@/app/landing/landing";

export const metadata = {
  title: "Sign in",
};

/**
 * /signin is the same landing as "/", with the access-denied copy in the
 * "Come on in" card when Auth.js refused the account (?error=AccessDenied).
 * The copy itself and why it stays neutral live in app/landing/landing.tsx.
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

  return <Landing accessDenied={accessDenied} />;
}
