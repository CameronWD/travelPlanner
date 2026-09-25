import { describe, expect, it, vi } from "vitest";
import { middleDate, deriveDayDates, applyThemeClass, ensureAuthenticated, playwrightMissingMessage } from "./audit-browser";

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
    const page = {
      goto: vi.fn(async () => void events.push("goto")),
      url: () => "http://localhost:3000/signin",
      getByText: vi.fn(() => button),
      waitForURL: vi.fn(async () => undefined),
    };
    return { page, events };
  };

  it("runs on the first page load, before any sign-in click", async () => {
    const { page, events } = signinPage();
    await ensureAuthenticated(page as never, "http://localhost:3000", {
      afterFirstLoad: async () => void events.push("check"),
    });
    expect(events).toEqual(["goto", "check", "click"]);
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
});

// Final review: the not-found message always said `npm run audit:contrast`, even from the layout audit.
describe("playwrightMissingMessage", () => {
  it("names the script that needs Playwright", () => {
    expect(playwrightMissingMessage("audit:layout", "/usr/lib/node_modules")).toMatch(
      /NODE_PATH=\/path\/to\/global\/node_modules npm run audit:layout$/,
    );
    expect(playwrightMissingMessage("audit:layout:crops", null)).toMatch(/npm run audit:layout:crops$/);
  });
  it("for audit:contrast (resolvePlaywright's default), word for word what contrast-audit printed before", () =>
    expect(playwrightMissingMessage("audit:contrast", "/g")).toBe(
      [
        "Playwright is required to run this audit, and could not be found.",
        "",
        "It is deliberately NOT a project dependency — see the docblock at the",
        "top of contrast-audit.ts — so it needs a one-time install of its own:",
        "",
        "  npx playwright install chromium",
        "",
        "If that alone doesn't fix it, Playwright's Node package itself isn't",
        "resolvable from here. Either install it locally without saving it to",
        "package.json:",
        "",
        "  npm install --no-save playwright && npx playwright install chromium",
        "",
        `...or, if it's installed globally somewhere this check didn't find (checked "/g"),`,
        "point Node at that location directly:",
        "",
        "  NODE_PATH=/path/to/global/node_modules npm run audit:contrast",
      ].join("\n"),
    ));
  it("says when npm root -g itself failed", () =>
    expect(playwrightMissingMessage("audit:layout", null)).toMatch(/\("npm root -g" itself failed\)/));
});
