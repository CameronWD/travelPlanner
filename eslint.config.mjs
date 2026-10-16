import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ── Import boundaries (spec 2026-10-14 card 3.N, Q8, Q14) ──────────────────
// ESLint never merges a rule's options across blocks: for each file the LAST
// matching block's `no-restricted-imports` / `no-restricted-syntax` wins
// outright. So every block below lists ALL the restrictions for its files,
// built from the shared pieces, and blocks run broad → narrow. Pinned by
// eslint.config.test.ts, which lints probe snippets through this file.

const TESTS = ["**/*.test.ts", "**/*.test.tsx"];

/** `@/<dir>` or any `../`-relative path into the top-level `<dir>`. */
const into = (dir) => `^(?:@/|(?:\\.\\./)+)${dir}(?:/|$)`;
const ACTING = "(?:^|/)acting-traveller(?:\\.[cm]?[jt]s)?$";

const I = {
  server: { regex: into("server"), message: "lib may not import server (Q8): move the pure read to lib/*-reads.ts and let the action call it." },
  serverButActions: { regex: "^(?:@/|(?:\\.\\./)+)server(?:/(?!actions/[^/]+$)|$)", message: "lib/mcp/tools and lib/booking-import/confirm.ts adapt server/actions/* and import nothing else under server (Q14)." },
  components: { regex: into("components"), message: "lib may not import components (Q8): the view type lives in lib and the component imports it." },
  app: { regex: into("app"), message: "lib and components may not import app (Q8)." },
  libDb: { regex: "^(?:@/|(?:\\.\\./)+)lib/db$", message: "components may not import lib/db (Q8): read through a lib/*-reads.ts module." },
  enums: { regex: "^(?:@/lib/|\\./)enums$", message: "lib/enums builds zod schemas at load: import the plain values from @/lib/enum-values (spec 2026-10-06 §R)." },
  motion: { group: ["motion/react"], importNames: ["motion"], message: "Render m.* inside LazyMotion, never the full motion bundle (spec 2026-10-06 §Q)." },
  acting: { regex: ACTING, message: "Only lib/guards.ts, lib/activity-record.ts, lib/mcp/run-tool.ts and app/api/mcp/route.ts may import lib/mcp/acting-traveller." },
  runAs: { regex: ACTING, importNames: ["runAsTraveller"], message: "runAsTraveller is reachable only from app/api/mcp/route.ts." },
  zod: { group: ["zod", "zod/*"], message: "lib/enum-values.ts stays zod-free (spec 2026-10-06 §R)." },
};

const TRIP_LINK = "Build internal Trip links with tripPath() from lib/trip-path.ts (ADR 0064).";
const ACTING_DYNAMIC = "lib/mcp/acting-traveller is reachable only from its four allowlisted importers.";
const S = {
  actingDynamic: [
    { selector: `ImportExpression[source.value=/${ACTING.replaceAll("/", "\\/")}/]`, message: ACTING_DYNAMIC },
    { selector: `CallExpression[callee.name='require'][arguments.0.value=/${ACTING.replaceAll("/", "\\/")}/]`, message: ACTING_DYNAMIC },
  ],
  tripLinks: [
    // `/trips/${…}` — but not `/api/trips/${…}` (ids) or inside revalidatePath(…) (takes the id path).
    { selector: "TemplateElement[tail=false][value.raw=/(?<!\\/api)\\/trips\\/$/]:not(CallExpression[callee.name='revalidatePath'] TemplateElement)", message: TRIP_LINK },
    { selector: "BinaryExpression[operator='+'] > Literal.left[value='/trips/']", message: TRIP_LINK },
    // `base + "/trips/" + id`: the literal is the right operand of the inner `+`.
    { selector: "BinaryExpression[operator='+'] > Literal.right[value='/trips/']", message: TRIP_LINK },
    { selector: "BinaryExpression[operator='+'] > TemplateLiteral.left[expressions.length=0][quasis.0.value.raw='/trips/']", message: TRIP_LINK },
  ],
  imageLoader: [
    { selector: "Program:not([body.0.directive='use client']):has(ImportDeclaration[source.value='next/image']) JSXAttribute[name.name='loader']", message: "A next/image loader function can only be handed over from a \"use client\" module (React error #441, 2026-09-28)." },
  ],
  mustImportVisibility: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/surprise-visibility']))", message: "This Item/Accommodation reader does not go through readPlan, so it must import lib/surprise-visibility (ADR 0072)." },
  ],
  mustImportGuard: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/surprise-guard']))", message: "An Attachment-bytes reader must import lib/surprise-guard (ADR 0072)." },
  ],
  mustUseRowAccess: [
    { selector: "Program:not(:has(ImportDeclaration[source.value='@/lib/guards'] > ImportSpecifier[imported.name='requireRowAccess']))", message: "lib/mcp/real-plan.ts delegates its Surprise check to requireRowAccess from lib/guards (ADR 0072)." },
  ],
  // Any mention of runAsTraveller (a dynamic import's property included) outside its module and the MCP route.
  runAsName: [
    { selector: "Identifier[name='runAsTraveller']", message: "runAsTraveller is reachable only from app/api/mcp/route.ts." },
  ],
  // `export * from` the module would re-publish runAsTraveller, from any file (the route included).
  exportAllActing: [
    { selector: `ExportAllDeclaration[source.value=/${ACTING.replaceAll("/", "\\/")}/]`, message: "Never `export *` from lib/mcp/acting-traveller: it would re-export runAsTraveller." },
  ],
  noUseServer: [
    { selector: "ExpressionStatement[directive='use server']", message: "lib/mcp/acting-traveller.ts must never be \"use server\": runAsTraveller would become a callable action." },
  ],
};

/** Readers of Item/Accommodation rows that do not go through readPlan (ADR 0072, amended 2026-10-15). */
export const SURPRISE_VISIBILITY_READERS = [
  "lib/day-reads.ts",
  "lib/day-view-loader.ts",
  "lib/budget-loader.ts",
  "lib/money-due-count.ts",
  "lib/desktop-home-loader.ts",
  "lib/travelling-home-loader.ts",
  "lib/past-home-loader.ts",
  "lib/flags-loader.ts",
  "lib/digest-dispatch.ts",
  "lib/activity-reads.ts",
  "lib/reminder-reads.ts",
  "lib/mcp/reads/trip-plan.ts",
  "lib/mcp/reads/costs.ts",
  "lib/mcp/reads/attachments.ts",
  "lib/mcp/tools/reads.ts",
  "server/actions/search.ts",
  "server/actions/ai.ts",
  "server/actions/forks.ts",
  "app/(app)/trips/[tripId]/files/page.tsx",
  "app/(app)/trips/[tripId]/layout.tsx",
  "app/(app)/trips/[tripId]/activity/page.tsx",
];
/** Readers of an Attachment's bytes (ADR 0072). */
export const SURPRISE_GUARD_READERS = ["app/api/attachments/[id]/route.ts", "lib/mcp/reads/attachment-content.ts", "lib/guards.ts"];

const LIB_I = [I.acting, I.enums, I.motion, I.server, I.components, I.app];
const MCP_I = [I.acting, I.motion, I.server, I.components, I.app];
const ADAPTER_I = [I.acting, I.motion, I.serverButActions, I.components, I.app];
const LIB_S = [...S.actingDynamic, ...S.tripLinks];
const UI_S = [...S.actingDynamic, ...S.tripLinks, ...S.imageLoader];
const runAs = (imports) => imports.map((p) => (p === I.acting ? I.runAs : p));

/**
 * Broad → narrow. `match` mirrors `files` so a single-file block below can
 * start from its folder's zone instead of silently replacing it.
 */
const ZONE_DEFS = [
  { name: "everywhere", files: ["**/*.{js,mjs,cjs,ts,tsx}"], match: () => true, imports: [I.acting], syntax: S.actingDynamic },
  { name: "server", files: ["server/**"], match: (f) => f.startsWith("server/"), imports: [I.acting], syntax: LIB_S },
  { name: "app", files: ["app/**"], match: (f) => f.startsWith("app/"), imports: [I.acting, I.enums, I.motion], syntax: UI_S },
  { name: "components", files: ["components/**"], match: (f) => f.startsWith("components/"), imports: [I.acting, I.enums, I.motion, I.libDb, I.app], syntax: UI_S },
  { name: "lib", files: ["lib/**"], match: (f) => f.startsWith("lib/"), imports: LIB_I, syntax: LIB_S },
  // lib/mcp is reached only from app/api/mcp/route.ts (runtime nodejs), so @/lib/enums is fine there.
  { name: "lib-mcp", files: ["lib/mcp/**"], match: (f) => f.startsWith("lib/mcp/"), imports: MCP_I, syntax: LIB_S },
  // Q14: the adapters over the actions.
  { name: "lib-mcp-tools", files: ["lib/mcp/tools/**"], match: (f) => f.startsWith("lib/mcp/tools/"), imports: ADAPTER_I, syntax: LIB_S },
  { name: "booking-confirm", files: ["lib/booking-import/confirm.ts"], match: (f) => f === "lib/booking-import/confirm.ts", imports: [...ADAPTER_I, I.enums], syntax: LIB_S },
  { name: "validations", files: ["lib/validations/**", "lib/enums.ts"], match: (f) => f.startsWith("lib/validations/") || f === "lib/enums.ts", imports: MCP_I, syntax: LIB_S },
  { name: "enum-values", files: ["lib/enum-values.ts"], match: (f) => f === "lib/enum-values.ts", imports: [...LIB_I, I.zod], syntax: LIB_S },
  { name: "trip-path", files: ["lib/trip-path.ts", "lib/revalidate.ts"], match: (f) => f === "lib/trip-path.ts" || f === "lib/revalidate.ts", imports: LIB_I, syntax: S.actingDynamic },
  // The acting-traveller allowlist: may import the module and its dynamic forms, never runAsTraveller.
  { name: "acting-lib", files: ["lib/guards.ts", "lib/activity-record.ts"], match: (f) => f === "lib/guards.ts" || f === "lib/activity-record.ts", imports: runAs(LIB_I), syntax: S.tripLinks },
  { name: "acting-run-tool", files: ["lib/mcp/run-tool.ts"], match: (f) => f === "lib/mcp/run-tool.ts", imports: runAs(MCP_I), syntax: S.tripLinks },
  { name: "acting-module", files: ["lib/mcp/acting-traveller.ts"], match: (f) => f === "lib/mcp/acting-traveller.ts", imports: MCP_I.filter((p) => p !== I.acting), syntax: [...S.tripLinks, ...S.noUseServer] },
  { name: "mcp-route", files: ["app/api/mcp/route.ts"], match: (f) => f === "app/api/mcp/route.ts", imports: [I.enums, I.motion], syntax: [...S.tripLinks, ...S.imageLoader] },
];

/** Every zone also bans `export * from` the module, and every zone but the module and the route bans the name runAsTraveller. */
const RUN_AS_OWNERS = new Set(["acting-module", "mcp-route"]);
const ZONES = ZONE_DEFS.map((z) => ({
  ...z,
  syntax: [...z.syntax, ...S.exportAllActing, ...(RUN_AS_OWNERS.has(z.name) ? [] : S.runAsName)],
}));

const zoneOf = (file) => ZONES.findLast((z) => z.match(file));
const glob = (file) => file.replace(/[[\]]/g, "\\$&");
const rules = (imports, syntax) => ({
  "no-restricted-imports": imports.length ? ["error", { patterns: imports }] : "off",
  "no-restricted-syntax": syntax.length ? ["error", ...syntax] : "off",
});
/** One file that must import something: its folder's zone, plus the extra check. */
const mustImport = (name, file, extra) => {
  const z = zoneOf(file);
  return { name: `boundaries/${name}:${file}`, files: [glob(file)], ignores: TESTS, rules: rules(z.imports, [...z.syntax, ...extra]) };
};

const boundaries = [
  ...ZONES.map((z) => ({ name: `boundaries/${z.name}`, files: z.files, ignores: TESTS, rules: rules(z.imports, z.syntax) })),
  ...SURPRISE_VISIBILITY_READERS.map((f) => mustImport("surprise-visibility", f, S.mustImportVisibility)),
  ...SURPRISE_GUARD_READERS.map((f) => mustImport("surprise-guard", f, S.mustImportGuard)),
  mustImport("real-plan", "lib/mcp/real-plan.ts", S.mustUseRowAccess),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Exported design-tool artefacts (mock HTML + its support bundle), not
    // app source — linting them reports on generated third-party output.
    "design_handoff/**",
  ]),
]);

export default eslintConfig;
