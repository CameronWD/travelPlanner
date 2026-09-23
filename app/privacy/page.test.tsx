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
  // id_token/scope, Session.sessionToken) were undisclosed.
  it("discloses the stored Google OAuth tokens", async () => {
    render(await PrivacyPage());
    expect(screen.getByText(/access and refresh tokens/i)).toBeInTheDocument();
  });
});
