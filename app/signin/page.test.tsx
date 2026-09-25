import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SignInPage from "./page";

/**
 * app/signin/page.tsx is an async server component — invoke it directly to
 * get its resolved element tree, then render that with RTL. searchParams is
 * a Promise in this Next version (see app/(app)/trips/[tripId]/plan/page.tsx).
 */

describe("SignInPage", () => {
  it("explains an access denial without revealing the request's state", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) });
    render(page);
    expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded the attempt for the admin/i)).toBeInTheDocument();
  });

  // I2 (final fix wave): the card is shown to a brand-new stranger, someone
  // already waiting, someone dismissed and someone revoked alike. It promised
  // "you'll be able to sign in here once you're approved", which is false for
  // the last two — and app/privacy/page.tsx already said so, so two shipped
  // surfaces contradicted each other.
  it("promises nothing about approval, so the copy is true for a dismissed or revoked reader too", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) });
    const { container } = render(page);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/once you(’|')?re approved/i);
    expect(text).toMatch(/not every request is granted/i);
  });

  it("does not show the explanatory card for an ordinary visit", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.queryByText(/invite-only/i)).not.toBeInTheDocument();
  });

  it("does not show the explanatory card for a different/unrelated error", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "Configuration" }) });
    render(page);
    expect(screen.queryByText(/invite-only/i)).not.toBeInTheDocument();
  });

  it("still renders the ordinary sign-in card underneath the explanation", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) });
    render(page);
    expect(screen.getByText(/Welcome to TEEPEE/i)).toBeInTheDocument();
  });

  // LA-054: footer links are padded, spaced tap targets (no bare "·" separator).
  it("footer links are padded, spaced tap targets", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({}) });
    render(page);
    const privacy = screen.getByRole("link", { name: "Privacy" });
    expect(privacy.className).toContain("tap-target");
    expect(privacy.parentElement!.className).toContain("gap-4");
    expect(privacy.parentElement).toHaveTextContent(/^PrivacyTerms$/);
  });

  // M-10: a second, unlabelled <nav> is indistinguishable in a landmarks list.
  it("labels the footer links' nav landmark 'Legal'", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({}) });
    render(page);
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(nav).toContainElement(screen.getByRole("link", { name: "Privacy" }));
  });
});
