"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Allow and Cancel on the consent screen. Both post the signed query to
 * /oauth2/consent and follow the redirect it answers with: back to Claude
 * with a code, or with access_denied.
 */
export function ConsentForm({ oauthQuery }: { oauthQuery: string }) {
  const [pending, setPending] = useState<"allow" | "cancel" | null>(null);
  const [failed, setFailed] = useState(false);

  async function answer(accept: boolean) {
    setPending(accept ? "allow" : "cancel");
    setFailed(false);
    try {
      const res = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery });
      const url = res.data?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
    } catch {
      // Falls through to the failure line.
    }
    setFailed(true);
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button onClick={() => void answer(true)} loading={pending === "allow"} disabled={pending !== null}>
          Allow
        </Button>
        <Button variant="secondary" onClick={() => void answer(false)} loading={pending === "cancel"} disabled={pending !== null}>
          Cancel
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          That did not go through. Start again from Claude.
        </p>
      )}
    </div>
  );
}
