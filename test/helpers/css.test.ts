import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { atRule, commentText, declValues, decls, findRules, globalsCss, lightTheme, mentions, reducedMotion, rule, selectorsOf } from "./css";

const SHEET = postcss.parse(`
[data-theme="light"],
:root { --a: 1; color-scheme: light; }
/* a comment naming tp-ghost */
.x:is(.a, .b), .y { animation: tp-x 1s  linear; animation-delay: 0s !important; }
@layer base { @media (prefers-reduced-motion: reduce) { .x { animation: none !important; } } }
@utility pad { padding: 1rem; &::before { content: ""; } }
`);

describe("test/helpers/css", () => {
  it("splits a selector list on top-level commas only, whitespace collapsed", () => {
    expect(selectorsOf(findRules(".y", SHEET)[0])).toEqual([".x:is(.a, .b)", ".y"]);
  });

  it("rule() matches a whole selector list and names what it could not find", () => {
    expect(decls(rule([".x:is(.a, .b)", ".y"], SHEET))).toEqual({ animation: "tp-x 1s linear", "animation-delay": "0s !important" });
    expect(() => rule(".y", SHEET)).toThrow('no rule ".y"');
    expect(() => atRule("utility", "nope", SHEET)).toThrow("no @utility nope");
  });

  it("finds reduced-motion blocks at any depth", () => {
    expect(decls(rule(".x", reducedMotion(SHEET)))).toEqual({ animation: "none !important" });
  });

  it("decls() reads direct children only; declValues() reads every depth", () => {
    const pad = atRule("utility", "pad", SHEET);
    expect(decls(pad)).toEqual({ padding: "1rem" });
    expect(declValues("content", pad)).toEqual(['""']);
  });

  it("mentions() ignores comments; commentText() reads them", () => {
    expect(mentions("tp-ghost", SHEET)).toBe(false);
    expect(commentText(SHEET)).toContain("tp-ghost");
    expect(mentions("tp-x", SHEET)).toBe(true);
  });

  it("parses app/globals.css and finds the light palette rule", () => {
    expect(globalsCss().nodes.length).toBeGreaterThan(0);
    expect(decls(lightTheme())["--background"]).toBe("40 100% 98%");
  });
});
