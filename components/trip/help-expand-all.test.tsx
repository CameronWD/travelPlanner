import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpExpandAll } from "./help-expand-all";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function withDetails() {
  const host = document.createElement("div");
  host.innerHTML = `
    <details id="a"><summary>A</summary><p>a</p></details>
    <details id="b" open><summary>B</summary><p>b</p></details>
  `;
  document.body.appendChild(host);
  return host;
}

describe("HelpExpandAll", () => {
  it("opens every section when told to expand", async () => {
    const host = withDetails();
    render(<HelpExpandAll />);
    await userEvent.click(screen.getByRole("button", { name: /expand all/i }));
    expect(
      Array.from(host.querySelectorAll("details")).every((d) => d.open),
    ).toBe(true);
  });

  it("closes every section when told to collapse", async () => {
    const host = withDetails();
    render(<HelpExpandAll />);
    await userEvent.click(screen.getByRole("button", { name: /collapse all/i }));
    expect(
      Array.from(host.querySelectorAll("details")).some((d) => d.open),
    ).toBe(false);
  });

  it("is hidden from print, which already forces every section open", () => {
    const { container } = render(<HelpExpandAll />);
    expect(container.firstElementChild?.className).toContain("help-print-hide");
  });
});
