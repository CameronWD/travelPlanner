import { readFileSync } from "node:fs";
import path from "node:path";
import postcss, { type AtRule, type Container, type Root, type Rule } from "postcss";

/**
 * app/globals.css as a PostCSS tree, so a test pins a rule's meaning
 * (selector, at-rule, declarations) rather than its spacing (spec
 * 2026-10-14 card 3.P). Plain `postcss.parse`, no Tailwind pass: `@utility`,
 * `@theme`, `@layer` and `@custom-variant` stay the at-rules written in the
 * file. Every lookup walks at any depth, in document order.
 */
const GLOBALS = path.join(process.cwd(), "app/globals.css");

let parsed: Root | null = null;
export function globalsCss(): Root {
  parsed ??= postcss.parse(readFileSync(GLOBALS, "utf8"), { from: GLOBALS });
  return parsed;
}

type Scope = Container | readonly Container[];
const list = (scope: Scope): readonly Container[] => ("walk" in scope ? [scope] : scope);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const valueOf = (d: { value: string; important: boolean }) => squash(d.important ? `${d.value} !important` : d.value);

/** A rule's selector list (split on top-level commas), each selector whitespace-collapsed. */
export function selectorsOf(r: Rule): string[] {
  return r.selectors.map(squash);
}

/** Every rule under `scope` whose selector list includes `selector`. */
export function findRules(selector: string, scope: Scope = globalsCss()): Rule[] {
  const want = squash(selector);
  const out: Rule[] = [];
  for (const s of list(scope)) s.walkRules((r) => { if (selectorsOf(r).includes(want)) out.push(r); });
  return out;
}

/** The first rule under `scope` whose selector list is exactly `selectors`. Throws, naming it, when there is none. */
export function rule(selectors: string | readonly string[], scope: Scope = globalsCss()): Rule {
  const want = (typeof selectors === "string" ? [selectors] : selectors).map(squash);
  for (const s of list(scope)) {
    const hits: Rule[] = [];
    s.walkRules((r) => {
      const got = selectorsOf(r);
      if (got.length === want.length && got.every((g, i) => g === want[i])) {
        hits.push(r);
        return false;
      }
    });
    if (hits[0]) return hits[0];
  }
  throw new Error(`no rule "${want.join(", ")}"`);
}

/** Every `@name` at-rule under `scope`, optionally only those whose prelude is `params` (whitespace-collapsed). */
export function atRules(name: string, params?: string, scope: Scope = globalsCss()): AtRule[] {
  const want = params === undefined ? undefined : squash(params);
  const out: AtRule[] = [];
  for (const s of list(scope)) s.walkAtRules(name, (a) => { if (want === undefined || squash(a.params) === want) out.push(a); });
  return out;
}

/** The first `@name params` under `scope`. Throws, naming it, when there is none. */
export function atRule(name: string, params: string, scope: Scope = globalsCss()): AtRule {
  const hit = atRules(name, params, scope)[0];
  if (!hit) throw new Error(`no @${name} ${params}`);
  return hit;
}

export const utility = (name: string): AtRule => atRule("utility", name);
export const keyframes = (name: string): AtRule => atRule("keyframes", name);

/** Every `@media (prefers-reduced-motion: reduce)` block, at any depth (one sits inside `@layer base`). */
export const reducedMotion = (scope: Scope = globalsCss()): AtRule[] => atRules("media", "(prefers-reduced-motion: reduce)", scope);

/** The light palette: `[data-theme="light"], :root`, which the light-locked surfaces re-declare. */
export const lightTheme = (): Rule => rule(['[data-theme="light"]', ":root"]);

/** A node's own declarations (direct children only), prop → value, with `!important` kept on the value. A later declaration wins. */
export function decls(node: Container): Record<string, string> {
  const out: Record<string, string> = {};
  node.each((child) => { if (child.type === "decl") out[child.prop] = valueOf(child); });
  return out;
}

/** The value of every declaration of `prop` (an exact name or a pattern) under `scope`, at any depth. */
export function declValues(prop: string | RegExp, scope: Scope = globalsCss()): string[] {
  const out: string[] = [];
  for (const s of list(scope)) s.walkDecls(prop, (d) => { out.push(valueOf(d)); });
  return out;
}

/** Every selector of every rule under `scope`. */
export function allSelectors(scope: Scope = globalsCss()): string[] {
  const out: string[] = [];
  for (const s of list(scope)) s.walkRules((r) => { out.push(...selectorsOf(r)); });
  return out;
}

/** True when a selector, at-rule prelude, declaration name or value under `scope` contains `text`. Comments don't count. */
export function mentions(text: string, scope: Scope = globalsCss()): boolean {
  let found = false;
  for (const s of list(scope)) {
    s.walk((n) => {
      const parts = n.type === "rule" ? [n.selector] : n.type === "atrule" ? [n.params] : n.type === "decl" ? [n.prop, n.value] : [];
      if (parts.some((p) => p.includes(text))) {
        found = true;
        return false;
      }
    });
  }
  return found;
}

/** The text of every comment under `scope`, newline-joined. */
export function commentText(scope: Scope = globalsCss()): string {
  const out: string[] = [];
  for (const s of list(scope)) s.walkComments((c) => { out.push(c.text); });
  return out.join("\n");
}
