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

function rulesFor(text: string): CopyViolation["rule"][] {
  const rules: CopyViolation["rule"][] = [];
  if (text.includes(EM_DASH) && text.trim() !== EM_DASH) rules.push("em-dash");
  if (/\bFailed to\b/.test(text)) rules.push("failed-to");
  if (/please try again/i.test(text)) rules.push("please-try-again");
  return rules;
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
      (current.name.text === "route" || current.name.text === "source")
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
  rawText: string,
) {
  const text = rawText;
  for (const rule of rulesFor(text)) {
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
      if (!isExempt(node)) pushViolations(violations, file, sourceFile, node, node.text);
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (!isExempt(node)) pushViolations(violations, file, sourceFile, node, node.text);
    } else if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text && !isExempt(node)) pushViolations(violations, file, sourceFile, node, text);
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
