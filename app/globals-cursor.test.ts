import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

describe("pointer cursor (Feedback cmumcrjs1000304l71nj6l4fk)", () => {
  it("gives every enabled button, role=button and summary a pointer cursor in one base rule", () => {
    expect(css).toMatch(
      /:where\(button, \[role="button"\], summary\):not\(:disabled, \[aria-disabled="true"\]\)\s*\{\s*cursor:\s*pointer;\s*\}/,
    );
  });
});
