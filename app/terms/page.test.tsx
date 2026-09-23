import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage from "./page";

/** Public and unauthenticated, same reasoning as app/privacy/page.test.tsx. */
describe("TermsPage", () => {
  it("renders the terms page without a session", async () => {
    render(await TermsPage());
    expect(
      screen.getByRole("heading", { name: /terms/i }),
    ).toBeInTheDocument();
  });

  it("states TEEPEE is provided without warranty", async () => {
    render(await TermsPage());
    expect(screen.getByText(/without warranty/i)).toBeInTheDocument();
  });

  it("states access can be revoked at any time", async () => {
    render(await TermsPage());
    expect(
      screen.getByText(/revoke access at any time/i),
    ).toBeInTheDocument();
  });
});
