import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "./page";

/**
 * Public and unauthenticated — no session, no (app) layout, no mocking of
 * auth() required. This is exactly the surface the OAuth consent screen
 * links to, and exactly who reads it: someone who cannot sign in.
 */
describe("PrivacyPage", () => {
  it("renders the privacy page without a session", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByRole("heading", { name: /privacy/i }),
    ).toBeInTheDocument();
  });

  it("names the third parties data is shared with", async () => {
    render(await PrivacyPage());
    expect(screen.getAllByText(/Google/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cloudflare R2/)).toBeInTheDocument();
    expect(screen.getAllByText(/Vercel/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Neon/)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap \(Nominatim\) and CARTO/)).toBeInTheDocument();
  });

  it("discloses access requests from people who never get an account", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/even if you are never granted an account/i),
    ).toBeInTheDocument();
  });

  it("discloses error reports, including from the browser", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Error reports\./)).toBeInTheDocument();
  });

  it("does not promise self-serve export", async () => {
    render(await PrivacyPage());
    expect(
      screen.queryByText(/download your data|export your data/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/ask the admin and they'll send you a copy/i),
    ).toBeInTheDocument();
  });

  // Fix round 1, C1: dismiss is terminal (server/actions/access-requests.ts
  // lists on resolvedAt: null; lib/access-requests.ts's repeat-attempt path
  // never clears resolvedAt or re-notifies) — the page must not promise a
  // route back that does not exist.
  it("does not claim a dismissed access request comes back on a retry", async () => {
    render(await PrivacyPage());
    expect(
      screen.queryByText(/puts it back in front of the admin/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/closed for\s*good/i)).toBeInTheDocument();
  });

  // Fix round 1, C5/C7: GitHub holds the full backup for 30 days, and blob
  // deletion is a manual sweep (scripts/sweep-deleted-blobs.ts), not a
  // scheduled job.
  it("discloses GitHub as the backup's home and that file deletion is manual", async () => {
    render(await PrivacyPage());
    expect(screen.getAllByText(/GitHub/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/no scheduled job that does this on its own/i),
    ).toBeInTheDocument();
  });

  // Fix round 1, C6: Open-Meteo (stop coordinates + dates) and Frankfurter
  // (currency pairs) were outbound and undisclosed.
  it("discloses Open-Meteo and Frankfurter as outbound third parties", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText(/Frankfurter/)).toBeInTheDocument();
  });

  // Fix round 1: PushSubscription also stores timezone, a derived device
  // label and last-seen — "nothing that identifies the Device beyond that"
  // was false.
  it("discloses the device timezone and label stored with a push subscription", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/timezone that Device last reported/i)).toBeInTheDocument();
  });

  // Fix round 1: Activity (every create/update/delete) and FeedbackNote were
  // both missing from "what TEEPEE collects" entirely.
  it("discloses Activity and Feedback notes", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/logged as an Activity/i)).toBeInTheDocument();
    expect(screen.getByText(/Feedback notes\./)).toBeInTheDocument();
  });

  // Fix round 1: Google OAuth tokens (Account.access_token/refresh_token/
  // id_token/scope, Session.sessionToken) were undisclosed. Fix round 2, N5:
  // id_token itself was still missing from the list.
  it("discloses the stored Google OAuth tokens, including the ID token", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/access token, refresh token, ID token/i)).toBeInTheDocument();
  });

  // Fix round 2, N1: Anthropic was undisclosed, and must be worded so it
  // stays true whether ANTHROPIC_API_KEY is set or not (lib/ai.ts's
  // isAiConfigured gate, flippable per README.md with no code change) — so
  // the page must not simply assert it as a live, unconditional contact.
  it("discloses Anthropic as an optional, admin-gated AI assist", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Anthropic \(Claude\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/off unless the\s*Admin turns it on/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the entire text you paste/i),
    ).toBeInTheDocument();
  });

  // Fix round 2, N2/N6: "private build artifact" asserted a GitHub repo
  // visibility this repo cannot confirm, and implied the Admin's own copy
  // is made only after the 30-day window rather than during it.
  it("does not characterise the GitHub backup artifact as private", async () => {
    render(await PrivacyPage());
    expect(screen.queryByText(/private build artifact/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/During that window the Admin also copies/i),
    ).toBeInTheDocument();
  });

  // Fix round 2, N3: the admin-notify push only fires on a NEW error
  // signature (lib/error-sink.ts), and only when ADMIN_EMAILS/a Device is
  // configured — not unconditionally on every server error.
  it("states the admin push only fires on a new error signature", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/first time a given server-side failure/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a repeat of the\s*same failure only bumps a count/i),
    ).toBeInTheDocument();
  });

  // Fix round 2, N4: vercel.json only runs `prisma migrate deploy` when
  // VERCEL_ENV=production, not on every deploy.
  it("scopes the migration claim to a production deploy", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/runs the database migration on a production/i),
    ).toBeInTheDocument();
  });

  // Fix round 2, pre-existing cheap fix: the Globe is account-level, not
  // Trip content (CONTEXT.md) — Markers must not be listed under "Everything
  // you put in a Trip".
  it("lists the Globe separately from Trip content", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/Your Globe\./)).toBeInTheDocument();
    expect(
      screen.queryByText(/Globe Markers/i),
    ).not.toBeInTheDocument();
  });

  // Fix round 2: the missing test for C4's narrowed share-token wording —
  // the subtlest correction on the page, and the one round 1 shipped
  // without a pin.
  it("narrows the share-token redaction to the analytics payload only", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/stripped\s*before the page view is sent to analytics/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/still appears,\s*unredacted, in an Error report/i),
    ).toBeInTheDocument();
  });

  // Fix round 3, N1: the activity-suggestion payload was incomplete —
  // server/actions/ai.ts:51-55 loads every existing Item title on the Stop
  // and lib/ai.ts:97-100 inlines them into the prompt as "Avoid
  // suggesting: …". That's Traveller-authored content and belongs in the
  // colon-introduced exhaustive list of what leaves the system.
  it("discloses that existing Item titles are sent with an activity suggestion", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/titles of the Items already on that Stop/i),
    ).toBeInTheDocument();
  });

  // Fix round 3, second item: silence on who can read a GitHub Actions
  // artifact reads as an implicit "it's protected" in a section headed
  // "who it is shared with". This is a mechanism claim (stable under
  // either repo-visibility setting), not a visibility claim — same shape
  // as the Anthropic on/off wording.
  it("states the GitHub artifact's visibility mechanism without asserting a setting", async () => {
    render(await PrivacyPage());
    expect(
      screen.getByText(/exactly who can read the repository it/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the Admin can tell you what it is today/i),
    ).toBeInTheDocument();
  });
});
