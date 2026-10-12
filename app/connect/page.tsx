import type { Metadata } from "next";
import { headers } from "next/headers";
import { authServer } from "@/lib/auth";
import { requireUser } from "@/lib/guards";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { signedOAuthQuery, toSearchParams, type SearchParamsRecord } from "@/lib/oauth-continuation";
import { Card } from "@/components/ui/card";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect Claude" };

/**
 * The asking client's self-asserted public name ("" when it gave none), or
 * null when there is no such enabled client.
 */
async function clientName(clientId: string): Promise<string | null> {
  try {
    const client = await authServer.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() });
    return client.client_name?.trim() ?? "";
  } catch {
    return null;
  }
}

/** The host of a redirect URI, or null when it is not a URL. */
function hostOf(uri: string | null): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/**
 * Who is asking, read ONLY from the provider-signed query: a query whose
 * signature fails (tampered, expired, or hand-made) asks for nothing.
 */
async function askingClient(params: URLSearchParams) {
  const oauthQuery = signedOAuthQuery(params);
  if (!oauthQuery || !(await verifyOAuthQueryParams(oauthQuery, (await authServer.$context).secret))) return null;
  const signed = new URLSearchParams(oauthQuery);
  const clientId = signed.get("client_id");
  const returnsTo = hostOf(signed.get("redirect_uri"));
  if (!clientId || !returnsTo) return null;
  const name = await clientName(clientId);
  if (name === null) return null;
  return { oauthQuery, name, returnsTo };
}

const headingClass = "font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]";

/**
 * Claude's consent screen (ADR 0071, lib/auth.ts `consentPage`). The OAuth
 * provider sends a signed-in Traveller here with the authorise request in a
 * signed query, the first time a client asks. Allow or Cancel posts that query
 * back to /oauth2/consent, which redirects to the client with a code or with
 * access_denied.
 *
 * Client registration is open, so a client's name is self-asserted: the page
 * also shows where it returns to (the redirect host, which lib/auth.ts holds
 * to an allowlist), and an unnamed client is never given a name.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const traveller = await requireUser();
  const asking = await askingClient(toSearchParams(await searchParams));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card className="flex flex-col gap-4 p-6">
        {asking ? (
          <>
            <h1 className={headingClass}>
              {asking.name || `An app (returns to ${asking.returnsTo})`} wants to access your trips as{" "}
              {traveller.name || traveller.email}
            </h1>
            {asking.name && <p className="text-sm font-bold">Returns to {asking.returnsTo}</p>}
            <p className="text-sm text-muted-foreground">
              It will see and change exactly what you can. Everything it does shows in Activity, marked via Claude.
            </p>
            <ConsentForm oauthQuery={asking.oauthQuery} />
          </>
        ) : (
          <h1 className={headingClass}>Nothing is asking to connect.</h1>
        )}
      </Card>
    </main>
  );
}
