import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// spec 2026-10-06 §X: a client import of any of these is a build error, not
// a leaked secret. `import "server-only"` must be each file's first import.
const FILES = ["lib/db.ts", "lib/storage.ts", "lib/auth.ts", "lib/ai.ts", "lib/push.ts", "lib/mail.ts"];

describe("server-only boundary", () => {
  it.each(FILES)("%s imports server-only before anything else", (file) => {
    const src = readFileSync(path.resolve(__dirname, "..", file), "utf8");
    const firstImport = src.split("\n").find((line) => /^import\b/.test(line));
    expect(firstImport).toBe('import "server-only";');
  });

  it("pins @aws-sdk/client-s3 to the presigner's exact version", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
    expect(pkg.dependencies["@aws-sdk/client-s3"]).toBe(pkg.dependencies["@aws-sdk/s3-request-presigner"]);
    expect(pkg.dependencies["@aws-sdk/client-s3"]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
