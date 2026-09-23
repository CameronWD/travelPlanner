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
});
