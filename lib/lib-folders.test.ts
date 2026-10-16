import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Spec 2026-10-14 Q9 (card 3.O): five lib areas live in folders and are
 * imported directly, module by module — no barrel. A module added back flat
 * with an area's prefix, or an index file in one of the folders, fails here.
 * Naming inside a folder: scripts/codemods/lib-moves.ts.
 */
const LIB = path.join(process.cwd(), "lib");
const flat = readdirSync(LIB).filter((f) => /\.tsx?$/.test(f));

const FOLDERS: Record<string, RegExp> = {
  auth: /^(auth|sign-in)[.-]/,
  share: /^share-/,
  feedback: /^feedback-/,
};

describe.each(Object.entries(FOLDERS))("lib/%s/", (folder, flatName) => {
  it("exists and has no barrel", () => {
    const dir = path.join(LIB, folder);
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).filter((f) => /^index\.tsx?$/.test(f))).toEqual([]);
  });

  it("leaves no module of its area flat in lib/", () => {
    expect(flat.filter((f) => flatName.test(f))).toEqual([]);
  });
});
