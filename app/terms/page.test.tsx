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

  it("uses the Playground legal layout", async () => {
    const { container } = render(await TermsPage());
    expect(container.querySelector("[data-legal-page]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Teepee home" })).toHaveAttribute(
      "href",
      "/",
    );
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

  // LA-054: the inline "Privacy" link (in the Questions section, distinct
  // from the header's companion link of the same name) gets a 44px
  // coarse-pointer tap target.
  it("gives the inline Privacy link a 44px tap target", async () => {
    render(await TermsPage());
    const inlineLink = screen
      .getAllByRole("link", { name: "Privacy" })
      .find((el) => el.className.includes("tap-target"));
    expect(inlineLink).toBeDefined();
  });

  // Spec 2026-10-08 §H: first person, no "not a company, not a…" framing.
  it("says what Teepee is in the first person", async () => {
    render(await TermsPage());
    expect(document.body.textContent).toMatch(/I built Teepee/);
    expect(document.body.textContent).not.toMatch(/not a company|neither side needs|the Admin/i);
  });
});
