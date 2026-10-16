import path from "node:path";

/**
 * Spec 2026-10-14 card 3.O (Q9): the pure half of the one-off codemod that
 * moves flat `lib/` modules into `lib/<folder>/` and re-points every
 * reference. No I/O — `move-lib-modules.ts` feeds it `git ls-files` and file
 * contents. Run once per folder; re-running after a folder has moved throws
 * (its stems are gone), so it can never move a file twice.
 *
 * Naming rule: inside `lib/<folder>/` a module drops a leading `<folder>-`
 * prefix (`share-lookup` → `share/lookup`); a module named after the folder
 * keeps its name (`auth/auth`, `money/money`); and the prefix stays when the
 * shorter name would repeat the basename of another `lib` module
 * (`share-traveller`, `share-url` — `lib/traveller.ts` and `lib/url.ts` exist).
 */

/** Repo-relative old file → new file, both with their extension. */
export type Moves = Record<string, string>;

export const STEMS = {
  auth: [
    ["auth", "auth/auth"],
    ["auth-client", "auth/client"],
    ["auth-dev-login", "auth/dev-login"],
    ["auth-magic-link", "auth/magic-link"],
    ["auth-mcp-access", "auth/mcp-access"],
    ["auth-prisma", "auth/prisma"],
    ["auth-sign-in-link", "auth/sign-in-link"],
    ["sign-in-door", "auth/sign-in-door"],
    ["sign-in-email", "auth/sign-in-email"],
    ["sign-in-href", "auth/sign-in-href"],
    ["sign-in-redirect", "auth/sign-in-redirect"],
  ],
  money: [
    ["money", "money/money"],
    ["budget", "money/budget"],
    ["budget-loader", "money/budget-loader"],
    ["cost-labels", "money/cost-labels"],
    ["currencies", "money/currencies"],
    ["currency-for-country", "money/currency-for-country"],
    ["fx", "money/fx"],
    ["money-due-count", "money/due-count"],
    ["spend-so-far", "money/spend-so-far"],
    ["upcoming-payments", "money/upcoming-payments"],
  ],
  feedback: [
    ["feedback-context", "feedback/context"],
    ["feedback-device", "feedback/device"],
    ["feedback-inbox", "feedback/inbox"],
    ["feedback-queue", "feedback/queue"],
    ["feedback-site", "feedback/site"],
    ["feedback-trip-store", "feedback/trip-store"],
    ["feedback-view", "feedback/view"],
    ["feedback-accept-args", "feedback/cli/accept-args"],
    ["feedback-resolve-args", "feedback/cli/resolve-args"],
    ["feedback-resolve-site", "feedback/cli/resolve-site"],
  ],
  map: [
    ["map-icons", "map/icons"],
    ["map-overlap", "map/overlap"],
    ["map-palette", "map/palette"],
    ["map-pins", "map/pins"],
    ["map-tiles", "map/tiles"],
    ["maps", "map/maps"],
  ],
  share: [
    ["share-lookup", "share/lookup"],
    ["share-og", "share/og"],
    ["share-ref", "share/ref"],
    ["share-traveller", "share/share-traveller"],
    ["share-url", "share/share-url"],
    ["share-view", "share/view"],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

export type Folder = keyof typeof STEMS;

/**
 * Every tracked file of each stem — `lib/<stem>.ts` and any `lib/<stem>.<x>.ts(x)`
 * sibling (`.test.ts`, `.cache.test.ts`, …) — mapped to its new home.
 * Throws when a stem has no file (already moved, or renamed since the plan)
 * or a destination is taken.
 */
export function movesFor(folder: string, files: ReadonlySet<string>): Moves {
  if (!(folder in STEMS)) throw new Error(`Unknown folder "${folder}"; one of: ${Object.keys(STEMS).join(", ")}`);
  const moves: Moves = {};
  for (const [from, to] of STEMS[folder as Folder]) {
    const prefix = `lib/${from}.`;
    const found = [...files].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/") && /\.tsx?$/.test(f));
    if (found.length === 0) throw new Error(`lib/${from}.ts not found: already moved, or renamed since the plan?`);
    for (const f of found) {
      const dest = `lib/${to}${f.slice(`lib/${from}`.length)}`;
      if (files.has(dest)) throw new Error(`${dest} already exists`);
      moves[f] = dest;
    }
  }
  return moves;
}

const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs"];
const EXT_RE = /\.(tsx?|mts|m?js)$/;

/** The tracked file an `@/` or relative specifier names (TS bundler resolution order), or null. */
export function resolveSpecifier(spec: string, fromFile: string, files: ReadonlySet<string>): string | null {
  const joined = spec.startsWith("@/") ? spec.slice(2) : path.posix.join(path.posix.dirname(fromFile), spec);
  const base = path.posix.normalize(joined);
  if (base.startsWith("..")) return null;
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c)) ?? null;
}

function relativeSpec(fromFile: string, to: string): string {
  const rel = path.posix.relative(path.posix.dirname(fromFile), to);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

// A quoted `@/…`, `./…` or `../…` string with no interpolation: static and
// dynamic imports, `export … from`, `typeof import(…)`, `vi.mock`,
// `vi.importActual`, `require` alike.
const SPECIFIER = /(["'`])((?:@\/|\.\.?\/)[^"'`\s$]*)\1/g;

/**
 * `src` (the contents of `oldFile`) with every specifier that names a moved
 * file re-pointed, and — when `oldFile` itself moves — its relative
 * specifiers recomputed from the new location. Alias stays alias, relative
 * stays relative, an explicit extension is kept.
 */
export function rewriteSource(src: string, oldFile: string, moves: Moves, files: ReadonlySet<string>): string {
  const newFile = moves[oldFile] ?? oldFile;
  return src.replace(SPECIFIER, (whole: string, quote: string, spec: string) => {
    const target = resolveSpecifier(spec, oldFile, files);
    if (!target) return whole;
    const newTarget = moves[target] ?? target;
    if (newTarget === target && newFile === oldFile) return whole;
    const viaIndex = /\/index\.[a-z]+$/.test(target) && !/\/index(\.[a-z]+)?$/.test(spec);
    const out = EXT_RE.test(spec) ? newTarget : viaIndex ? path.posix.dirname(newTarget) : newTarget.replace(EXT_RE, "");
    const next = spec.startsWith("@/") ? `@/${out}` : relativeSpec(newFile, out);
    return next === spec ? whole : `${quote}${next}${quote}`;
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A path mention starts at a real path start: the start of the text, or after
// a character that can't be part of a path, optionally through `@/`, `./` or
// `../` (repeated). `test/fixtures/lib/money.ts` or a URL ending in
// `/lib/fx.ts` names some other file, so it never matches.
const PATH_START = String.raw`(?<![\w.\-/@])((?:@\/|\.\/|(?:\.\.\/)+)?)`;

/** Repo-path mentions (`lib/share-url.ts`, `lib/share-url.test.ts:4`) in code strings, comments and living docs. */
export function rewritePathMentions(src: string, moves: Moves): string {
  let out = src;
  for (const [from, to] of Object.entries(moves).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`${PATH_START}${escapeRe(from)}(?![\\w-])`, "g"), `$1${to}`);
  }
  return out;
}
