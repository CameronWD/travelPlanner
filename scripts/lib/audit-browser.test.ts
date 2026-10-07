import { describe, expect, it, vi } from "vitest";
import { middleDate, deriveDayDates, applyThemeClass, ensureAuthenticated, resolvePlaywright, templatePath } from "./audit-browser";
import { chromium } from "playwright";

describe("middleDate", () => {
  it("returns null for no dates", () => expect(middleDate([])).toBeNull());
  it("picks the middle of an odd list", () => expect(middleDate(["2026-01-01", "2026-01-02", "2026-01-03"])).toBe("2026-01-02"));
  it("picks the upper-middle of an even list (same as contrast audit)", () =>
    expect(middleDate(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"])).toBe("2026-01-03"));
});

describe("deriveDayDates", () => {
  it("dedupes and sorts the /day/ hrefs found on the trip calendar", async () => {
    const page = {
      goto: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => ["2026-12-09", "2026-12-07", "2026-12-09"]),
    };
    const dates = await deriveDayDates(page as never, "http://localhost:3000", "t1");
    expect(page.goto).toHaveBeenCalledWith("http://localhost:3000/trips/t1/calendar", expect.anything());
    expect(dates).toEqual(["2026-12-07", "2026-12-09"]);
  });
});

describe("applyThemeClass", () => {
  it("adds .dark and waits to settle for dark", async () => {
    const page = { evaluate: vi.fn(async () => undefined), waitForTimeout: vi.fn(async () => undefined) };
    await applyThemeClass(page as never, "dark", 10);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).toHaveBeenCalledWith(10);
  });
});

describe("ensureAuthenticated: afterFirstLoad", () => {
  const signinPage = () => {
    const events: string[] = [];
    const button = { count: vi.fn(async () => 1), first: () => ({ click: vi.fn(async () => void events.push("click")) }) };
    const signInButton = {
      filter: () => ({
        first: () => ({ click: vi.fn(async () => void events.push("open")) }),
      }),
    };
    const page = {
      goto: vi.fn(async () => void events.push("goto")),
      url: () => "http://localhost:3000/",
      getByText: vi.fn(() => button),
      getByRole: vi.fn(() => signInButton),
      waitForURL: vi.fn(async () => undefined),
    };
    return { page, events };
  };

  it("runs on the first page load, before any sign-in click", async () => {
    const { page, events } = signinPage();
    await ensureAuthenticated(page as never, "http://localhost:3000", {
      afterFirstLoad: async () => void events.push("check"),
    });
    expect(events).toEqual(["goto", "check", "open", "click"]);
  });

  it("a throwing check aborts before signing in", async () => {
    const { page, events } = signinPage();
    await expect(
      ensureAuthenticated(page as never, "http://localhost:3000", {
        afterFirstLoad: async () => {
          throw new Error("not next dev");
        },
      }),
    ).rejects.toThrow("not next dev");
    expect(events).toEqual(["goto"]);
  });

  it("does nothing once already past the Landing", async () => {
    const { page, events } = signinPage();
    page.url = () => "http://localhost:3000/trips";
    await ensureAuthenticated(page as never, "http://localhost:3000");
    expect(events).toEqual(["goto"]);
  });
});

describe("templatePath", () => {
  it("swaps run-time ids for stable placeholders so baselines survive a reseed", () =>
    expect(
      templatePath("/trips/abc123/day/2026-12-20", { trip: "abc123", date: "2026-12-20" }),
    ).toBe("/trips/{trip}/day/{date}"));
  it("replaces every occurrence and leaves unrelated paths alone", () => {
    expect(templatePath("/share/tok/tok", { token: "tok" })).toBe("/share/{token}/{token}");
    expect(templatePath("/trips/does-not-exist", { trip: "abc123" })).toBe("/trips/does-not-exist");
  });
  it("ignores empty values rather than templating every gap", () =>
    expect(templatePath("/help", { trip: "" })).toBe("/help"));
});

describe("resolvePlaywright", () => {
  it("hands back the installed package's chromium (Playwright is a devDependency now)", () => {
    expect(resolvePlaywright().chromium).toBe(chromium);
  });
});
