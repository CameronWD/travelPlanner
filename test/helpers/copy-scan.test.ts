import { expect, it } from "vitest";
import { scanSource } from "./copy-scan";

const v = (src: string) => scanSource("x.tsx", src).map((x) => x.rule);

it("flags em-dashes in strings, templates and JSX text", () => {
  expect(v(`const a = "one — two";`)).toEqual(["em-dash"]);
  expect(v("const a = `x — ${b} — y`;")).toEqual(["em-dash", "em-dash"]);
  expect(v(`const C = () => <p>Hello — there</p>;`)).toEqual(["em-dash"]);
});

it("allows a lone em-dash placeholder", () =>
  expect(v(`const C = () => <td>{"—"}</td>; const d = "—";`)).toEqual([]));

it("ignores comments, imports, directives, console and reportError context", () => {
  expect(
    v(
      `"use client";\n// a — b\n/* c — d */\nimport x from "a—b";\nconsole.warn("x — y");\nreportError(e, { route: "a — b", source: "server" });`,
    ),
  ).toEqual([]);
});

it("exempts route/source only inside a reportError(...) call argument", () => {
  expect(v(`reportError(e, { route: "a — b" });`)).toEqual([]);
  expect(v(`const x = { source: "a — b" };`)).toEqual(["em-dash"]);
});

it("flags Failed to and Please try again", () => {
  expect(v(`toast.error("Failed to reorder stops.")`)).toEqual(["failed-to"]);
  expect(v(`const e = "Upload failed. Please try again.";`)).toEqual(["please-try-again"]);
});

it("reports line numbers", () => expect(scanSource("x.ts", `\n\nconst a = "a — b";`)[0].line).toBe(3));

it("normalises whitespace before matching phrase rules, so a wrapped JSX phrase is still caught", () => {
  expect(v(`const C = () => <p>Please try\n   again.</p>;`)).toEqual(["please-try-again"]);
  expect(v(`const e = \`Upload failed.\n    Please   try\tagain.\`;`)).toEqual(["please-try-again"]);
});

it("flags a lone em-dash JsxText that sits between sibling expressions", () => {
  expect(v(`const C = () => <span>{a} — {b}</span>;`)).toEqual(["em-dash"]);
  expect(v(`const C = () => <span>{a}—{b}</span>;`)).toEqual(["em-dash"]);
});

it("still allows a lone em-dash JsxText that is the only child of its element", () => {
  expect(v(`const C = () => <td> — </td>;`)).toEqual([]);
  expect(v(`const C = () => <td>—</td>;`)).toEqual([]);
});

it("still allows a string or template literal whose whole text is exactly an em-dash", () => {
  expect(v(`const a = "—"; const b = \`—\`;`)).toEqual([]);
});
