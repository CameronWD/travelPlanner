import { describe, expect, it } from "vitest";
import { movesFor, rewritePathMentions, rewriteSource } from "./lib-moves";

const files = new Set([
  "lib/share-url.ts",
  "lib/share-url.test.ts",
  "lib/share-traveller.ts",
  "lib/traveller.ts",
  "lib/url.ts",
  "lib/money.ts",
  "lib/money/to-pay.ts",
  "lib/demo/index.ts",
  "lib/feedback-inbox.ts",
  "lib/share-lookup.ts",
  "lib/share-view.ts",
  "app/x/page.tsx",
  "app/(app)/admin/feedback-review.tsx",
  "scripts/feedback-pull.ts",
]);
const moves = {
  "lib/share-url.ts": "lib/share/share-url.ts",
  "lib/share-url.test.ts": "lib/share/share-url.test.ts",
  "lib/share-traveller.ts": "lib/share/share-traveller.ts",
  "lib/money.ts": "lib/money/money.ts",
  "lib/feedback-inbox.ts": "lib/feedback/inbox.ts",
  "lib/share-lookup.ts": "lib/share/lookup.ts",
  "lib/share-view.ts": "lib/share/view.ts",
};

describe("rewriteSource", () => {
  it("re-points an import, a vi.mock string, a dynamic import and a typeof import", () => {
    const src = [
      `import { shareUrl } from "@/lib/share-url";`,
      `vi.mock("@/lib/share-url", () => ({}));`,
      `const m = await import('@/lib/share-url');`,
      "type M = typeof import(`@/lib/share-url`);",
    ].join("\n");
    expect(rewriteSource(src, "app/x/page.tsx", moves, files)).toBe(
      [
        `import { shareUrl } from "@/lib/share/share-url";`,
        `vi.mock("@/lib/share/share-url", () => ({}));`,
        `const m = await import('@/lib/share/share-url');`,
        "type M = typeof import(`@/lib/share/share-url`);",
      ].join("\n"),
    );
  });

  it("re-points a moved file's relative imports at its unmoved and moved neighbours", () => {
    const src = `import { a } from "./traveller";\nimport { b } from "./share-url";\nimport { c } from "@/lib/url";`;
    expect(rewriteSource(src, "lib/share-traveller.ts", moves, files)).toBe(
      `import { a } from "../traveller";\nimport { b } from "./share-url";\nimport { c } from "@/lib/url";`,
    );
  });

  it("re-points a relative import from outside lib", () => {
    expect(rewriteSource(`import { renderInbox } from "../lib/feedback-inbox";`, "scripts/feedback-pull.ts", moves, files)).toBe(
      `import { renderInbox } from "../lib/feedback/inbox";`,
    );
  });

  it("resolves @/lib/money to the flat file, not the folder, and leaves the folder's modules alone", () => {
    const src = `import { convertMinor } from "@/lib/money";\nimport { mergeToPay } from "@/lib/money/to-pay";`;
    expect(rewriteSource(src, "app/x/page.tsx", moves, files)).toBe(
      `import { convertMinor } from "@/lib/money/money";\nimport { mergeToPay } from "@/lib/money/to-pay";`,
    );
  });

  it("re-points export … from, vi.importActual and importOriginal<typeof import(…)>", () => {
    const src = [
      `export { shareUrl } from "@/lib/share-url";`,
      `export * from "@/lib/money";`,
      `const real = await vi.importActual<typeof import("@/lib/money")>("@/lib/money");`,
      `vi.mock("@/lib/money", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/money")>()) }));`,
    ].join("\n");
    expect(rewriteSource(src, "app/x/page.tsx", moves, files)).toBe(
      [
        `export { shareUrl } from "@/lib/share/share-url";`,
        `export * from "@/lib/money/money";`,
        `const real = await vi.importActual<typeof import("@/lib/money/money")>("@/lib/money/money");`,
        `vi.mock("@/lib/money/money", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/money/money")>()) }));`,
      ].join("\n"),
    );
  });

  it("keeps an explicit .ts extension, alias and relative alike", () => {
    expect(rewriteSource(`import { m } from "@/lib/money.ts";\nimport { r } from "../lib/feedback-inbox.ts";`, "scripts/feedback-pull.ts", moves, files)).toBe(
      `import { m } from "@/lib/money/money.ts";\nimport { r } from "../lib/feedback/inbox.ts";`,
    );
  });

  it("re-points ../<moved> from a file already inside the destination folder", () => {
    expect(rewriteSource(`import { convertMinor } from "../money";`, "lib/money/to-pay.ts", moves, files)).toBe(
      `import { convertMinor } from "./money";`,
    );
  });

  it("re-points a moved file's import of a moved, renamed neighbour", () => {
    expect(rewriteSource(`import { toView } from "./share-view";`, "lib/share-lookup.ts", moves, files)).toBe(
      `import { toView } from "./view";`,
    );
  });

  it("leaves unrelated, same-named, index and package specifiers alone", () => {
    const src = `import "server-only";\nimport { d } from "@/lib/demo";\nimport { P } from "./feedback-review";`;
    expect(rewriteSource(src, "app/(app)/admin/page.tsx", moves, files)).toBe(src);
  });
});

describe("rewritePathMentions", () => {
  it("rewrites exact repo paths, with or without a line number, and nothing longer", () => {
    expect(rewritePathMentions(`see lib/share-url.ts:4 and "lib/share-url.test.ts"; not lib/share-url.tsx or lib/money.tsx`, moves)).toBe(
      `see lib/share/share-url.ts:4 and "lib/share/share-url.test.ts"; not lib/share-url.tsx or lib/money.tsx`,
    );
  });

  it("rewrites a path after @/, ./ or ../ but not one nested under another directory", () => {
    const src = [
      "lib/money.ts",
      "`@/lib/money.ts` ./lib/money.ts ../lib/money.ts ../../lib/feedback-inbox.ts",
      "test/fixtures/lib/money.ts node_modules/x/lib/money.ts https://example.com/lib/feedback-inbox.ts",
    ].join("\n");
    expect(rewritePathMentions(src, moves)).toBe(
      [
        "lib/money/money.ts",
        "`@/lib/money/money.ts` ./lib/money/money.ts ../lib/money/money.ts ../../lib/feedback/inbox.ts",
        "test/fixtures/lib/money.ts node_modules/x/lib/money.ts https://example.com/lib/feedback-inbox.ts",
      ].join("\n"),
    );
  });

  it("is idempotent", () => {
    const once = rewritePathMentions("lib/money.ts and lib/feedback-inbox.ts", moves);
    expect(rewritePathMentions(once, moves)).toBe(once);
  });
});

describe("movesFor", () => {
  it("takes every sibling of a stem and applies the naming rule", () => {
    const tracked = new Set(["lib/share-url.ts", "lib/share-url.test.ts", "lib/share-lookup.ts", "lib/share-lookup.cache.test.ts", "lib/share-og.ts", "lib/share-ref.ts", "lib/share-traveller.ts", "lib/share-view.ts"]);
    expect(movesFor("share", tracked)).toMatchObject({
      "lib/share-url.ts": "lib/share/share-url.ts",
      "lib/share-url.test.ts": "lib/share/share-url.test.ts",
      "lib/share-lookup.cache.test.ts": "lib/share/lookup.cache.test.ts",
      "lib/share-og.ts": "lib/share/og.ts",
    });
  });

  it("refuses an unknown folder and a stem with no file", () => {
    expect(() => movesFor("nope", files)).toThrow(/Unknown folder/);
    expect(() => movesFor("share", files)).toThrow(/lib\/share-og\.ts not found/);
  });
});
