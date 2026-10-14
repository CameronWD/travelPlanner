import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".next", "design_handoff", ".git"]);

/** Every file under `dir` (recursive) whose extension is in `exts`, as paths relative to cwd. */
export function walkSources(dir: string, opts: { exts?: readonly string[]; skipTests?: boolean } = {}): string[] {
  const exts = opts.exts ?? [".ts", ".tsx"];
  const out: string[] = [];
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (SKIP.has(entry)) continue;
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) visit(p);
      else if (exts.some((e) => p.endsWith(e)) && !(opts.skipTests && /\.test\.tsx?$/.test(p))) out.push(path.relative(process.cwd(), p));
    }
  };
  visit(dir);
  return out;
}
