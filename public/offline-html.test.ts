// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, it, expect, beforeEach } from "vitest";
import { RESERVED_TRIP_SLUGS } from "../lib/trip-slug";

const HTML = readFileSync(join(__dirname, "offline.html"), "utf8");
const SCRIPT = HTML.match(/<script>([\s\S]*?)<\/script>/)![1];

function runScript(caches?: unknown) {
  const window = caches ? { caches } : {};
  vm.runInContext(SCRIPT, vm.createContext({ window, caches, document, location: { origin: "https://teepee.example" }, URL }));
}

function pagesCache(urls: string[]) {
  return {
    open: async (name: string) => ({
      keys: async () => (name === "teepee-pages-v1" ? urls.map((url) => new Request(url)) : []),
    }),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("public/offline.html", () => {
  beforeEach(() => {
    document.body.innerHTML = HTML.match(/<body>([\s\S]*?)<\/body>/)![1];
  });

  it("says saved pages can be read and changes need a connection", () => {
    expect(HTML).not.toContain("will sync");
    expect(HTML).toContain("need a connection");
    expect(HTML).toContain('id="saved-trips"');
  });

  it("leaves out exactly the reserved Trip slugs (lib/trip-slug.ts)", () => {
    expect(HTML).toContain(`var reserved = [${[...RESERVED_TRIP_SLUGS].map((s) => `'${s}'`).join(", ")}];`);
  });

  it("lists cached Trip Homes, newest first, then the Trips list", async () => {
    runScript(
      pagesCache([
        "https://teepee.example/trips",
        "https://teepee.example/trips/lisbon-weekend",
        "https://teepee.example/trips/lisbon-weekend/budget",
        "https://teepee.example/trips/new",
        "https://teepee.example/trips/christmas-in-europe-2026",
        "https://teepee.example/trips/x?tab=1",
        "https://elsewhere.example/trips/y",
        "https://teepee.example/",
      ]),
    );
    await settle();

    const list = document.getElementById("saved-trips")!;
    const links = [...list.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(list.hidden).toBe(false);
    expect(links).toEqual([
      ["Christmas In Europe 2026", "/trips/christmas-in-europe-2026"],
      ["Lisbon Weekend", "/trips/lisbon-weekend"],
      ["Your trips", "/trips"],
    ]);
  });

  it("hides the list when no Trip page is cached", async () => {
    runScript(pagesCache(["https://teepee.example/"]));
    await settle();

    expect(document.getElementById("saved-trips")!.hidden).toBe(true);
  });

  it("does not throw and keeps the list hidden without the Cache API", async () => {
    expect(() => runScript()).not.toThrow();
    await settle();

    expect(document.getElementById("saved-trips")!.hidden).toBe(true);
  });
});
