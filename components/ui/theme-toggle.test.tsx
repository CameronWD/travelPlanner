import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("adds the dark class when toggled on", async () => {
    const user = userEvent.setup();
    renderToggle();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class when toggled back off", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button");
    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the chosen theme to localStorage", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button"));
    expect(window.localStorage.getItem("trip-planner-theme")).toBe("dark");
  });
});
