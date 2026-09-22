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
    expect(screen.getByText(/passed your request to the admin/i)).toBeInTheDocument();
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
});
