import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { FORCED_THEME, ThemeProvider, noFlashScript, resolveTheme, useTheme } from "./theme-provider";

const KEY = "trip-planner-theme";
const html = () => document.documentElement;
const darkOS = (q: string) => q === "(prefers-color-scheme: dark)";
/** Runs the pre-paint script the way the browser would: as plain global code. */
const runScript = (script: string) => new Function(script)();

function ShowTheme() {
  const { theme } = useTheme();
  return <p>theme: {theme}</p>;
}

// Spec 2026-10-04 §F: dark mode is parked — everyone renders light, whatever
// they chose before or their OS prefers (docs/open-follow-ups.md DM-01).
describe("ThemeProvider while dark mode is parked", () => {
  beforeEach(() => {
    html().classList.remove("dark");
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // test/setup's default: light, and only Tailwind's sm breakpoint matches.
    setMatchMedia((q) => q === "(min-width: 640px)");
  });

  it("forces light", () => {
    expect(FORCED_THEME).toBe("light");
  });

  it("renders light for a Traveller who chose dark on a dark OS, and overwrites the stored choice", async () => {
    setMatchMedia(darkOS);
    window.localStorage.setItem(KEY, "dark");
    html().classList.add("dark");

    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );

    expect(await screen.findByText("theme: light")).toBeInTheDocument();
    expect(html().classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("renders light when localStorage is unavailable", async () => {
    setMatchMedia(darkOS);
    html().classList.add("dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );

    expect(await screen.findByText("theme: light")).toBeInTheDocument();
    expect(html().classList.contains("dark")).toBe(false);
  });

  it("injects the forced pre-paint script", () => {
    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );
    expect(document.querySelector("script")?.innerHTML).toBe(noFlashScript("light"));
  });

  it("the pre-paint script clears .dark and stores light, ignoring a stored dark and a dark OS", () => {
    setMatchMedia(darkOS);
    window.localStorage.setItem(KEY, "dark");
    html().classList.add("dark");

    runScript(noFlashScript(FORCED_THEME));

    expect(html().classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("the pre-paint script still clears .dark when localStorage throws", () => {
    html().classList.add("dark");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => runScript(noFlashScript(FORCED_THEME))).not.toThrow();
    expect(html().classList.contains("dark")).toBe(false);
  });

  it("un-parked (null), the stored choice and then the OS preference win again", () => {
    window.localStorage.setItem(KEY, "dark");
    expect(resolveTheme(null)).toBe("dark");
    runScript(noFlashScript(null));
    expect(html().classList.contains("dark")).toBe(true);

    window.localStorage.clear();
    setMatchMedia(darkOS);
    expect(resolveTheme(null)).toBe("dark");
    setMatchMedia(false);
    expect(resolveTheme(null)).toBe("light");
  });
});
