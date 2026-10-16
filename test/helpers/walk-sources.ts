import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", "design_handoff"]);

/**
 * Every file under `dir` (recursive) whose extension is in `exts`, as paths
 * relative to cwd. Skips `node_modules`, `design_handoff`, and any entry
 * whose name starts with "." (`.next`, `.git`, and route-convention
 * directories like `app/.well-known` included) — the same generic skip the
 * seven guard tests' own `walk()` copies applied before this helper replaced
 * them.
 *
 * `opts.skipTests` drops `*.test.ts`/`*.test.tsx` files from the result.
 *
 * `dir` must exist — a missing directory throws ENOENT (`readdirSync`'s own
 * error), same as reading any other file; callers that walk a directory
 * that might not exist (an optional subtree, a renamed/removed folder) guard
 * it with `existsSync(dir)` first rather than catching here.
 */
export function walkSources(dir: string, opts: { exts?: readonly string[]; skipTests?: boolean } = {}): string[] {
  const exts = opts.exts ?? [".ts", ".tsx"];
  const out: string[] = [];
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (SKIP.has(entry) || entry.startsWith(".")) continue;
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) visit(p);
      else if (exts.some((e) => p.endsWith(e)) && !(opts.skipTests && /\.test\.tsx?$/.test(p))) out.push(path.relative(process.cwd(), p));
    }
  };
  visit(dir);
  return out;
}
