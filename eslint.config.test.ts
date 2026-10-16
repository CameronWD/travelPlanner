import { existsSync } from "node:fs";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";
import { SURPRISE_GUARD_READERS, SURPRISE_VISIBILITY_READERS } from "./eslint.config.mjs";

/**
 * The import boundaries (spec 2026-10-14 card 3.N, Q8, Q14) are lint rules in
 * eslint.config.mjs. This pins that each one fires through the real config —
 * ESLint lets a later block silently replace an earlier block's
 * no-restricted-imports/-syntax, so a zone that forgets a restriction would
 * otherwise pass unnoticed. It replaces the six walk-based guard tests
 * (enum-values, trip-links, surprise-readers, image-loader-boundary,
 * motion-lazy, acting-traveller-imports).
 */
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function reports(filePath: string, code: string): Promise<boolean> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  return result.messages.some((m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-syntax");
}

const VIS = 'import { loadSurpriseVisibility } from "@/lib/surprise-visibility";\nexport const v = loadSurpriseVisibility;';
const GUARD = 'import { surpriseRootFor } from "@/lib/surprise-guard";\nexport const g = surpriseRootFor;';

// [what, file, code, reported?]
const CASES: [string, string, string, boolean][] = [
  // Q8: lib may not import server (types included; relative paths too)
  ["lib → server action", "lib/probe.ts", 'import { createStop } from "@/server/actions/stops";', true],
  ["lib → server, type only", "lib/probe.ts", 'import type { CostRow } from "@/server/actions/costs";', true],
  ["lib → server, relative", "lib/sub/probe.ts", 'import { x } from "../../server/actions/stops";', true],
  // Q14: the adapters may import server/actions/<file>, nothing else under server
  ["MCP tool → server action", "lib/mcp/tools/probe.ts", 'import { createStop } from "@/server/actions/stops";', false],
  ["MCP tool → elsewhere under server", "lib/mcp/tools/probe.ts", 'import { x } from "@/server/internal/thing";', true],
  ["booking confirm → server action", "lib/booking-import/confirm.ts", 'import "server-only";\nimport { createStop } from "@/server/actions/stops";', false],
  ["another booking-import file → server action", "lib/booking-import/build.ts", 'import { createStop } from "@/server/actions/stops";', true],
  // Q8: lib may not import components or app
  ["lib → components (type)", "lib/probe.ts", 'import type { AttachmentView } from "@/components/trip/attachment-list";', true],
  ["lib → app", "lib/probe.ts", 'import { x } from "@/app/(app)/trips/[tripId]/files/page";', true],
  // Q8: components may not import lib/db or app
  ["components → lib/db", "components/probe.tsx", 'import { db } from "@/lib/db";', true],
  ["components → lib/db, relative", "components/a/probe.tsx", 'import { db } from "../../lib/db";', true],
  ["components → app", "components/probe.tsx", 'import { x } from "@/app/(app)/trips/[tripId]/files/page";', true],
  ["components → server action is fine", "components/probe.tsx", 'import { createStop } from "@/server/actions/stops";', false],
  ["app → lib/db is fine", "app/probe.tsx", 'import { db } from "@/lib/db";', false],
  // spec 2026-10-06 §R: lib/enums only from server-side validation and lib/mcp; enum-values zod-free
  ["component → lib/enums", "components/probe.tsx", 'import { TRANSPORT_MODES } from "@/lib/enums";', true],
  ["validation → lib/enums", "lib/validations/probe.ts", 'import { TRANSPORT_MODES } from "@/lib/enums";', false],
  ["MCP → lib/enums", "lib/mcp/probe.ts", 'import { TRANSPORT_MODES } from "@/lib/enums";', false],
  ["enum-values → zod", "lib/enum-values.ts", 'import { z } from "zod";', true],
  // spec 2026-10-06 §Q: LazyMotion only
  ["m from motion/react", "components/probe.tsx", 'import { m } from "motion/react";', false],
  ["motion from motion/react", "components/probe.tsx", 'import { m, motion } from "motion/react";', true],
  // runAsTraveller / acting-traveller reachable only from the allowlist
  ["guards → acting-traveller", "lib/guards.ts", `import { getActingTraveller } from "@/lib/mcp/acting-traveller";\n${GUARD}`, false],
  ["guards → runAsTraveller", "lib/guards.ts", `import { runAsTraveller } from "@/lib/mcp/acting-traveller";\n${GUARD}`, true],
  ["an allowlisted acting-traveller importer is still a lib file", "lib/guards.ts", `import { x } from "@/components/ui/button";\n${GUARD}`, true],
  ["guards → dynamic runAsTraveller", "lib/guards.ts", `export const r = async () => (await import("@/lib/mcp/acting-traveller")).runAsTraveller;\n${GUARD}`, true],
  ["run-tool → dynamic runAsTraveller", "lib/mcp/run-tool.ts", 'export const r = async () => (await import("@/lib/mcp/acting-traveller")).runAsTraveller;', true],
  ["export * from acting-traveller, even in the MCP route", "app/api/mcp/route.ts", 'export * from "@/lib/mcp/acting-traveller";', true],
  ["MCP route → runAsTraveller", "app/api/mcp/route.ts", 'import { runAsTraveller } from "@/lib/mcp/acting-traveller";', false],
  ["an action → acting-traveller", "server/actions/probe.ts", 'import { getActingTraveller } from "@/lib/mcp/acting-traveller";', true],
  ["relative → acting-traveller", "lib/mcp/reads/probe.ts", 'import { getActingTraveller } from "../acting-traveller";', true],
  ["re-export of acting-traveller", "app/api/mcp/probe.ts", 'export { runAsTraveller } from "@/lib/mcp/acting-traveller";', true],
  ["dynamic import of acting-traveller", "scripts/probe.mjs", 'await import("../lib/mcp/acting-traveller.ts");', true],
  ["acting-traveller as use server", "lib/mcp/acting-traveller.ts", '"use server";\nexport async function f() {}', true],
  // ADR 0064: Trip links through tripPath
  ["hand-built /trips/${…}", "components/probe.tsx", "export const u = (id: string) => `/trips/${id}/plan`;", true],
  ['"/trips/" + id', "server/actions/probe.ts", 'export const u = (id: string) => "/trips/" + id;', true],
  ['base + "/trips/" + id', "components/probe.tsx", 'export const u = (base: string, id: string) => base + "/trips/" + id;', true],
  ['base + "/api/trips/" + id is an id route', "components/probe.tsx", 'export const u = (base: string, id: string) => base + "/api/trips/" + id;', false],
  ["/api/trips/${…} is an id route", "components/probe.tsx", "export const u = (id: string) => `/api/trips/${id}/cover`;", false],
  ["revalidatePath takes the id path", "server/actions/probe.ts", 'import { revalidatePath } from "next/cache";\nexport const r = (id: string) => revalidatePath(`/trips/${id}/plan`);', false],
  ["lib/trip-path.ts builds them", "lib/trip-path.ts", "export const u = (id: string) => `/trips/${id}`;", false],
  // next/image loader only from a "use client" module
  ["loader= in a Server Component", "components/probe.tsx", 'import Image from "next/image";\nconst l = () => "";\nexport const C = () => <Image src="a" alt="" loader={l} />;', true],
  ["loader= in a Client Component", "components/probe.tsx", '"use client";\nimport Image from "next/image";\nconst l = () => "";\nexport const C = () => <Image src="a" alt="" loader={l} />;', false],
  // ADR 0072: non-readPlan readers import the Surprise helpers
  ["a visibility reader without the import", "lib/day-reads.ts", "export const x = 1;", true],
  ["a visibility reader with it", "lib/day-reads.ts", VIS, false],
  ["a visibility reader is still a lib file", "lib/day-reads.ts", `${VIS}\nimport type { A } from "@/components/x";`, true],
  ["an app visibility reader without the import", "app/(app)/trips/[tripId]/layout.tsx", "export const x = 1;", true],
  ["an attachment-bytes reader without the guard", "app/api/attachments/[id]/route.ts", "export const x = 1;", true],
  ["real-plan without requireRowAccess", "lib/mcp/real-plan.ts", 'import { requireUser } from "@/lib/guards";\nexport const x = requireUser;', true],
  // spec 3.P: one spelling of a UTC calendar date
  ["toISOString().slice in lib", "lib/probe.ts", "export const d = (x: Date) => x.toISOString().slice(0, 10);", true],
  ["toISOString().slice in a narrow zone", "lib/guards.ts", `export const d = (x: Date) => x.toISOString().slice(0, 10);\n${GUARD}`, true],
  // Tests sit outside every boundary
  ["a test reaches across layers", "lib/probe.test.ts", 'import { db } from "@/lib/db";\nimport { runAsTraveller } from "@/lib/mcp/acting-traveller";\nimport { createStop } from "@/server/actions/stops";', false],
];

describe("import boundaries (eslint.config.mjs, card 3.N)", { timeout: 30_000 }, () => {
  it.each(CASES)("%s", async (_what, file, code, expected) => {
    expect(await reports(file, code)).toBe(expected);
  });

  it.each([...SURPRISE_VISIBILITY_READERS, ...SURPRISE_GUARD_READERS, "lib/mcp/real-plan.ts"])(
    "%s exists (a lint files glob that matches nothing is silent)",
    (file) => {
      expect(existsSync(file)).toBe(true);
    },
  );
});
