import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type CopyViolation = {
  file: string;
  line: number;
  text: string;
  rule: "em-dash" | "failed-to" | "please-try-again";
};

const EM_DASH = "—";

/** Collapses runs of whitespace (including line breaks) to one space, so a
 * phrase wrapped across lines or re-indented in JSX still matches. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * `allowLoneDashPlaceholder` is true only in a context where a standalone
 * `—` is the sanctioned empty-value placeholder (spec 2026-10-08 §F.1): a
 * whole StringLiteral/NoSubstitutionTemplateLiteral (the entire literal IS
 * the text), or a JsxText with no sibling children. A template literal's
 * head/middle/tail segment never qualifies, even when its own text trims to
 * "—" — a template with interpolations has no single "whole text" a segment
 * could stand in for, so a lone dash there is a separator between
 * interpolated values (the same shape as the JSX sibling case), not a
 * placeholder (fix round 1, live miss: lib/digest.ts). A dash sitting next
 * to other text is never exempt either way, even once normalized.
 */
function rulesFor(text: string, allowLoneDashPlaceholder: boolean): CopyViolation["rule"][] {
  const rules: CopyViolation["rule"][] = [];
  const normalized = normalizeWhitespace(text);
  const isLoneDash = normalized.trim() === EM_DASH;
  if (normalized.includes(EM_DASH) && !(isLoneDash && allowLoneDashPlaceholder)) rules.push("em-dash");
  if (/\bFailed to\b/.test(normalized)) rules.push("failed-to");
  if (/please try again/i.test(normalized)) rules.push("please-try-again");
  return rules;
}

/** True if `node` (a JsxText) is the only child of its JSX element/fragment —
 * the only shape where a lone `—` is unambiguously the empty-value
 * placeholder rather than a separator between sibling expressions.
 * Limitation: only the immediate parent is checked, so a dash whose own
 * parent has no other children but which sits inside a sibling of other
 * content one level up (e.g. `<div>{a}<span>—</span>{b}</div>`) is still
 * exempt. No known live instance of this shape today (fix round 1, minor). */
function isSoleJsxChild(node: ts.JsxText): boolean {
  const parent = node.parent;
  if (!parent) return false;
  const children = ts.isJsxElement(parent) || ts.isJsxFragment(parent) ? parent.children : undefined;
  if (!children) return false;
  return children.length === 1 && children[0] === node;
}

/** True if `node` (or one of its ancestors) means this text is not Traveller-facing. */
function isExempt(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current) || ts.isImportTypeNode(current)) {
      return true;
    }
    if (ts.isExpressionStatement(current) && isDirective(current)) {
      return true;
    }
    if (ts.isCallExpression(current) && isConsoleCall(current)) {
      return true;
    }
    if (
      ts.isPropertyAssignment(current) &&
      ts.isIdentifier(current.name) &&
      (current.name.text === "route" || current.name.text === "source") &&
      isReportErrorField(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/** A leading `"use client"` / `"use server"` directive prologue statement. */
function isDirective(statement: ts.ExpressionStatement): boolean {
  if (!ts.isStringLiteral(statement.expression)) return false;
  const text = statement.expression.text;
  if (text !== "use client" && text !== "use server") return false;
  const block = statement.parent;
  if (!block || !("statements" in block)) return false;
  const statements = (block as ts.SourceFile | ts.Block).statements;
  const index = statements.indexOf(statement as ts.Statement);
  if (index === -1) return false;
  // Must only be preceded by other directive prologue statements.
  for (let i = 0; i < index; i++) {
    const prior = statements[i];
    if (!ts.isExpressionStatement(prior) || !ts.isStringLiteral(prior.expression)) return false;
  }
  return true;
}

/** True for a `route`/`source` field of an object literal passed directly as an argument to `reportError(...)`. */
function isReportErrorField(property: ts.PropertyAssignment): boolean {
  const object = property.parent;
  if (!ts.isObjectLiteralExpression(object)) return false;
  const call = object.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(object)) return false;
  return ts.isIdentifier(call.expression) && call.expression.text === "reportError";
}

function isConsoleCall(call: ts.CallExpression): boolean {
  const expr = call.expression;
  return (
    ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "console"
  );
}

function pushViolations(
  violations: CopyViolation[],
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  text: string,
  allowLoneDashPlaceholder: boolean,
) {
  for (const rule of rulesFor(text, allowLoneDashPlaceholder)) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ file, line: line + 1, text, rule });
  }
}

export function scanSource(file: string, source: string): CopyViolation[] {
  const scriptKind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const violations: CopyViolation[] = [];

  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isExempt(node)) pushViolations(violations, file, sourceFile, node, node.text, true);
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // Never exempt: a template literal with interpolations has no single
      // "whole text" a segment could stand in for — a lone "—" head/middle/
      // tail is a separator between interpolated values, the same shape as
      // the JSX sibling case below, and must be flagged (fix round 1).
      if (!isExempt(node)) pushViolations(violations, file, sourceFile, node, node.text, false);
    } else if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text && !isExempt(node)) pushViolations(violations, file, sourceFile, node, text, isSoleJsxChild(node));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const SCAN_EXTS = new Set([".ts", ".tsx"]);
const EXTRA_FILES = [
  "lib/release-notes.ts",
  "lib/help-guide.ts",
  "lib/mail.ts",
  "lib/approval-email.ts",
  "lib/sign-in-email.ts",
  "lib/push.ts",
  "lib/admin-notify.ts",
];

function isTestFile(file: string): boolean {
  return /\.test\.tsx?$/.test(file) || file.endsWith(".d.ts");
}

function walk(root: string, dir: string, out: string[]) {
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir)) return;
  const entries = fs.readdirSync(absDir, { recursive: true }) as string[];
  for (const entry of entries) {
    const rel = path.join(dir, entry).split(path.sep).join("/");
    const abs = path.join(root, rel);
    if (!fs.statSync(abs).isFile()) continue;
    const ext = path.extname(rel);
    if (!SCAN_EXTS.has(ext)) continue;
    if (isTestFile(rel)) continue;
    out.push(rel);
  }
}

export function copyScanFiles(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["app", "components", "server"]) walk(root, dir, out);

  for (const file of EXTRA_FILES) {
    if (fs.existsSync(path.join(root, file))) out.push(file);
  }

  const libDir = path.join(root, "lib");
  if (fs.existsSync(libDir)) {
    const entries = fs.readdirSync(libDir, { recursive: true }) as string[];
    for (const entry of entries) {
      const rel = `lib/${entry.split(path.sep).join("/")}`;
      const abs = path.join(root, rel);
      if (!fs.statSync(abs).isFile()) continue;
      if (!/^lib\/digest/.test(rel)) continue;
      if (path.extname(rel) !== ".ts") continue;
      if (isTestFile(rel)) continue;
      out.push(rel);
    }
  }

  return [...new Set(out)].sort();
}
