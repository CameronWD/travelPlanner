import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AutoFinding } from "./checks";
import { ROUTES, buildCaptureMatrix, type CaptureSpec } from "./config";
import { exitCodeFor, filterCaptures, mergeRerun, rerunExitCode, shotLocation, summarise, type Manifest, type CaptureRecord } from "./run";

const cap = (o: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id: "deep/plan/deep/390-light", set: "deep", route: "/trips/x/plan", routeLabel: "plan", trip: "deep",
  width: 390, theme: "light", media: "screen", files: ["a.png"], elementCount: 200, findings: 0, ms: 10, ...o,
});
const man = (captures: CaptureRecord[], gaps: Manifest["gaps"] = []): Manifest => ({
  startedAt: "", finishedAt: "", baseUrl: "http://localhost:3000", outDir: "/tmp/x", trips: {}, gaps, captures,
});

describe("exitCodeFor", () => {
  it("0 for a clean run", () => expect(exitCodeFor(man([cap()]))).toBe(0));
  it("1 when nothing was captured", () => expect(exitCodeFor(man([]))).toBe(1));
  it("1 when any capture errored", () => expect(exitCodeFor(man([cap(), cap({ id: "b", error: "timeout" })]))).toBe(1));
  it("1 when a capture measured zero elements (broken probe)", () => expect(exitCodeFor(man([cap({ elementCount: 0 })]))).toBe(1));
  it("skipped captures don't fail the run", () => expect(exitCodeFor(man([cap(), cap({ id: "d", skipped: "n/a: no dated days", elementCount: 0, files: [] })]))).toBe(0));
  it("findings alone don't fail Stage 1", () => expect(exitCodeFor(man([cap({ findings: 12 })]))).toBe(0));
});

describe("summarise", () => {
  it("names gaps and errors loudly", () => {
    const s = summarise(man([cap({ id: "b", error: "timeout" })], [{ key: "travelling", reason: "expected travelling, got past" }]));
    expect(s).toMatch(/COVERAGE GAP.*travelling/);
    expect(s).toMatch(/ERROR.*b.*timeout/);
  });
  it("names zero-element captures and breaks findings down by check", () => {
    const s = summarise(man([cap({ id: "z", elementCount: 0 })]), [
      { id: "1", check: "overlap", captureId: "z", selector: "a", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "" },
      { id: "2", check: "overlap", captureId: "z", selector: "b", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "" },
    ]);
    expect(s).toMatch(/ZERO ELEMENTS z/);
    expect(s).toMatch(/overlap: 2/);
    expect(s).toMatch(/RESULT: FAIL/);
  });
});

// Beyond the brief: the rest of run.ts's pure surface.
describe("exitCodeFor: a run that skipped everything proved nothing", () => {
  it("1 when every capture was skipped", () =>
    expect(exitCodeFor(man([cap({ skipped: "coverage gap: x", elementCount: 0, files: [] })]))).toBe(1));
});

const spec = (o: Partial<CaptureSpec> = {}): CaptureSpec => ({
  id: "deep/plan/deep/390-light", set: "deep", route: ROUTES.find((r) => r.label === "plan")!, trip: "deep",
  width: 390, theme: "light", media: "screen", ...o,
});

describe("shotLocation", () => {
  it("pages go under shots/<set>/<routeLabel>/<trip>", () =>
    expect(shotLocation("/tmp/o", spec())).toEqual({ dir: "/tmp/o/shots/deep/plan/deep", baseName: "390-light" }));
  it("overlays go under shots/overlay/<overlayId>, keyboard variants get -kbd", () =>
    expect(shotLocation("/tmp/o", spec({ set: "overlay", overlay: "stop-add", keyboard: true, width: 360 }))).toEqual({
      dir: "/tmp/o/shots/overlay/stop-add",
      baseName: "360-light-kbd",
    }));
});

describe("mergeRerun", () => {
  const f = (captureId: string, id: string): AutoFinding => ({
    id, check: "overlap", captureId, selector: "a", rect: { x: 0, y: 0, w: 1, h: 1 }, detail: "",
  });
  const prev = {
    manifest: {
      ...man(
        [cap({ id: "a" }), cap({ id: "b", error: "timeout" }), cap({ id: "o", overlay: "stop-add", skipped: "coverage gap: x" })],
        [
          { key: "travelling", reason: "drifted" },
          { key: "share", reason: "no share link on settings" },
          { key: "overlay:stop-add", reason: "x (at 390)", captureId: "o" },
        ],
      ),
      startedAt: "t0",
    },
    findings: [f("a", "a1"), f("b", "b1"), f("o", "o1")],
  };
  const next = {
    manifest: { ...man([cap({ id: "b" }), cap({ id: "o", overlay: "stop-add" }), cap({ id: "c" })]), startedAt: "t1" },
    findings: [f("b", "b2"), f("c", "c1")],
  };
  const merged = mergeRerun(prev, next, ["deep", "sketching", "final-prep", "travelling", "past", "empty"]);

  it("replaces re-run captures in place and appends new ones", () => {
    expect(merged.manifest.captures.map((c) => c.id)).toEqual(["a", "b", "o", "c"]);
    expect(merged.manifest.captures[1].error).toBeUndefined();
    expect(exitCodeFor(merged.manifest)).toBe(0);
  });
  it("replaces the re-run captures' findings and keeps the rest", () =>
    expect(merged.findings.map((x) => x.id)).toEqual(["a1", "b2", "c1"]));
  it("drops re-evaluated run-level gaps and re-run captures' gaps, keeps un-evaluated ones", () =>
    expect(merged.manifest.gaps).toEqual([{ key: "share", reason: "no share link on settings" }]));
  it("keeps the first run's start time", () => expect(merged.manifest.startedAt).toBe("t0"));
  it("a re-run that captured something and fixed the errors passes, and says so", () => {
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(0);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: OK/);
  });
});

// Review fix: the merged manifest is the previous run's when this run captured nothing, so its
// exit code alone would pass a typo'd LAYOUT_AUDIT_ONLY. This run's own records must count too.
describe("a filtered re-run that captures nothing fails, even merged into a clean manifest", () => {
  const prev = { manifest: man([cap({ id: "a" }), cap({ id: "b" })]), findings: [] };

  it("no capture matched the filter", () => {
    const next = { manifest: man([]), findings: [] };
    const merged = mergeRerun(prev, next, []);
    expect(exitCodeFor(merged.manifest)).toBe(0); // the trap: the merged manifest alone looks clean
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(1);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: FAIL.*matched no captures/);
  });

  it("every re-run capture was skipped", () => {
    const next = { manifest: man([cap({ id: "b", skipped: "coverage gap: x", elementCount: 0, files: [] })]), findings: [] };
    const merged = mergeRerun(prev, next, []);
    expect(exitCodeFor(merged.manifest)).toBe(0);
    expect(rerunExitCode(next.manifest, merged.manifest)).toBe(1);
    expect(summarise(merged.manifest, merged.findings, next.manifest)).toMatch(/RESULT: FAIL.*all skipped/);
  });

  it("without a merge, this run and the manifest are the same thing", () => {
    const only = man([cap()]);
    expect(rerunExitCode(only, only)).toBe(0);
    expect(summarise(only, [], only)).toMatch(/RESULT: OK/);
  });
});

describe("filterCaptures", () => {
  const specs = [spec({ id: "deep/plan/deep/390-light" }), spec({ id: "overlay/stop-add/360-light" })];
  it("keeps everything when unset or blank", () => {
    expect(filterCaptures(specs, undefined)).toHaveLength(2);
    expect(filterCaptures(specs, "  ")).toHaveLength(2);
  });
  it("is a substring match on the id", () =>
    expect(filterCaptures(specs, "overlay/").map((s) => s.id)).toEqual(["overlay/stop-add/360-light"]));
  it("the documented overlay example matches the real overlay id shape", () => {
    const real = buildCaptureMatrix({ overlays: [{ id: "stop-add", form: true }, { id: "other-cost-add", form: true }], phaseTripsAvailable: [] });
    const hit = filterCaptures(real, "overlay/stop-add/").map((s) => s.id);
    expect(hit).toHaveLength(5);
    expect(hit.every((id) => id.startsWith("overlay/stop-add/"))).toBe(true);
  });
  it("commas separate alternatives", () => expect(filterCaptures(specs, "deep/plan/, stop-add")).toHaveLength(2));
  it("a filter that matches nothing yields nothing (and rerunExitCode then fails the run, merged or not)", () =>
    expect(filterCaptures(specs, "typo")).toEqual([]));
});

// The hard safety rule, pinned: nothing in the harness may import code that can reach a database
// (scripts/load-env.ts prefers .env.production.local — production).
// `import\s+` is on top of the brief's pattern: the repo's own scripts pull load-env in as a bare
// side-effect import (`import "./load-env";` — feedback-pull.ts, feedback-resolve.ts), which the
// `from`/`require(`/`import(` forms alone never match.
const DB_IMPORT = /(?:from\s+|import\s+|require\(\s*|import\(\s*)["'][^"']*(?:load-env|lib\/db|@prisma\/|dotenv)[^"']*["']/;

describe("safety: no database-capable imports", () => {
  it("the pattern catches every import form (positive control)", () => {
    for (const bad of [
      `import "./load-env";`,
      `import { db } from "@/lib/db";`,
      `import { PrismaClient } from "@prisma/client";`,
      `require("dotenv").config();`,
      `await import("../load-env");`,
      `export * from "../load-env";`,
    ]) expect(bad).toMatch(DB_IMPORT);
  });

  const files = [
    "scripts/layout-audit.ts",
    "scripts/lib/audit-browser.ts",
    ...readdirSync("scripts/layout-audit")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `scripts/layout-audit/${f}`),
  ];
  it.each(files)("%s", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(DB_IMPORT);
    expect(src).not.toMatch(/process\.env\.DATABASE_URL/);
  });
});
