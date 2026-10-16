import "server-only";
import { isAllowedEmail, hasPendingTripInvite, admitByTripInvite } from "@/lib/allowlist";
import { notifyAdmins } from "@/lib/admin-notify";
import { recordAccessRequest } from "@/lib/access-requests";
import { reportError } from "@/lib/error-sink";

export type DoorMethod = "google" | "magic-link" | "dev-login";
// magic-link send pass vs any completed sign-in (click pass, or any OAuth
// provider's single pass).
type DoorPass = "send" | "sign-in";

export interface DoorInput {
  email: string | null | undefined;
  method: DoorMethod;
  pass: DoorPass;
  /** Raw OAuth profile for google (email_verified, name, picture). */
  profile?: { email_verified?: unknown; name?: unknown; picture?: unknown } | null;
  nodeEnv?: string; // defaults to process.env.NODE_ENV
}

export type DoorDecision =
  | { allow: true; email: string }
  | { allow: false; reason: "no-email" | "unverified" | "refused" | "dev-login-in-production" };

export interface DoorDeps {
  isAllowedEmail: typeof isAllowedEmail;
  hasPendingTripInvite: typeof hasPendingTripInvite;
  admitByTripInvite: typeof admitByTripInvite;
  notifyAdmins: typeof notifyAdmins;
  recordAccessRequest: typeof recordAccessRequest;
}

const defaultDeps: DoorDeps = {
  isAllowedEmail,
  hasPendingTripInvite,
  admitByTripInvite,
  notifyAdmins,
  recordAccessRequest,
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * ADR 0057's one door, as a pure module. Performs the same side effects
 * today's Auth.js `signIn` callback (lib/auth/auth.ts) performs — admit, notify,
 * record — but returns a decision instead of a boolean/string, so Task 3's
 * Better Auth hooks can translate it into whatever shape each hook needs
 * (including the send pass's "answer exactly as an accepted address would"
 * behaviour, which lives in the hook, not here).
 */
export async function decideSignIn(
  input: DoorInput,
  deps: DoorDeps = defaultDeps,
): Promise<DoorDecision> {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;

  // Dev login is a passwordless sign-in-as-anyone door. The env var opts in
  // (lib/auth/auth.ts's provider registration), and this check is belt-and-braces
  // so a future refactor can't silently reopen it in production through this
  // door alone.
  if (input.method === "dev-login") {
    if (nodeEnv === "production") return { allow: false, reason: "dev-login-in-production" };
    const email = input.email?.trim().toLowerCase();
    if (!email) return { allow: false, reason: "no-email" };
    return { allow: true, email };
  }

  // Every write path must lowercase (ADR 0057 §"email normalisation").
  const email = input.email?.trim().toLowerCase();
  if (!email) return { allow: false, reason: "no-email" };

  // The magic-link SEND pass (before any token or mail is sent) vs the CLICK
  // pass (after the token has been verified) — or, for Google, its one and
  // only pass. Only the click proves the mailbox; the send pass is just
  // someone typing an address.
  const sending = input.method === "magic-link" && input.pass === "send";

  if (input.method === "magic-link") {
    // Sign-in link (spec 2026-10-01 §B2). The link itself — only ever
    // delivered to this address — is the proof of ownership, so the
    // Google-only verified-profile check below does not apply.
  } else if (input.profile?.email_verified !== true) {
    // Fail-closed by construction: every OTHER method — today Google, but
    // any future OAuth one too — must present a verified email rather than
    // being trusted by default.
    return { allow: false, reason: "unverified" };
  }

  let allowed: boolean;
  try {
    allowed = await deps.isAllowedEmail(email);
  } catch (err) {
    // Wrapped here (unlike today's callback, which rethrows): a lookup
    // failure refuses this sign-in rather than propagating as an unhandled
    // rejection into the Better Auth hooks. Reported first, so an outage is
    // visible rather than a silent flood of refusals. reportError never
    // throws.
    await reportError(err, { source: "server", route: "sign-in-door" });
    return { allow: false, reason: "refused" };
  }
  if (allowed) return { allow: true, email };

  const invited = await deps.hasPendingTripInvite(email);
  if (invited) {
    // On the Sign-in link's send pass, only permit the mail. Promotion and
    // the admin push wait for the click pass: anyone can TYPE an invited
    // address, and admitting on that would grant a durable AllowedEmail row
    // (and notify) without owning the mailbox.
    if (sending) return { allow: true, email };

    // Admission by Invite is otherwise a one-shot ticket: the Invite gets
    // marked accepted moments after this, so a second hasPendingTripInvite
    // check for the same address would come back false — locking out anyone
    // whose session lapses or who signs out. Promote them into the durable
    // allowlist instead (lib/allowlist.ts, admitByTripInvite).
    const { created } = await deps.admitByTripInvite(email);
    if (created) {
      // Fire once, on the admission that actually created the AllowedEmail
      // row, not on every subsequent sign-in. notifyAdmins never throws, so
      // awaiting it here cannot fail this sign-in.
      await deps.notifyAdmins(
        "New Traveller joined by invitation",
        `${email} was admitted to Teepee via a Trip Invite.`,
        "/admin",
      );
    }
    return { allow: true, email };
  }

  // Refused: record (or bump) the Access request — from Google's verified
  // profile, or from the bare address for a Sign-in link — then decline.
  // recordAccessRequest never throws — a failure to record it must not turn
  // this clean refusal into a 500. A Sign-in link refusal is typed,
  // unauthenticated input, so it never push-notifies, on either pass (ADR
  // 0057 §"A bump does not notify").
  await deps.recordAccessRequest(
    input.method === "magic-link"
      ? { email, name: null, image: null, notify: false }
      : { email, name: stringOrNull(input.profile?.name), image: stringOrNull(input.profile?.picture) },
  );

  return { allow: false, reason: "refused" };
}
