import { describe, expect, it } from "vitest";
import { CATEGORY_VALUES } from "@/lib/categories";
import { TRANSPORT_MODES, COST_SETTLEMENTS, CHECKLIST_KINDS, VOTE_LEVELS, BOOKING_STATES } from "@/lib/enum-values";
import {
  CATEGORY_MEANING,
  TRANSPORT_MODE_MEANING,
  SETTLEMENT_MEANING,
  CHECKLIST_KIND_MEANING,
  VOTE_LEVEL_MEANING,
  BOOKING_STATE_MEANING,
  REFUNDABLE_VALUES,
  REFUNDABLE_MEANING,
  WRITING_STYLE,
  CHECK_FACTS,
  describeValues,
} from "@/lib/mcp/vocab";
import { REVIEW_KINDS, FINDING_CATEGORIES, FINDING_STATES, FINDING_SEVERITIES, FINDING_ORIGINS } from "@/lib/review/types";
import {
  REVIEW_DEPTHS, REVIEW_DEPTH_MEANING, REVIEW_KIND_OF_DEPTH, DEPTH_OF_REVIEW_KIND,
  FINDING_CATEGORY_MEANING, FINDING_STATE_MEANING, FINDING_SEVERITY_MEANING, FINDING_ORIGIN_MEANING, FIX_WITH_TOOL,
} from "@/lib/mcp/vocab";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/server";
import { connectTestClient } from "@/lib/mcp/test-client";

// buildMcpServer() registers every tool group, so listing tools needs the
// whole graph to import cleanly — same minimal stubs prompts.test.ts uses.
import { vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

describe("every app value has a meaning for Claude", () => {
  it.each([
    ["Category", CATEGORY_VALUES, CATEGORY_MEANING],
    ["transport mode", TRANSPORT_MODES, TRANSPORT_MODE_MEANING],
    ["Settlement", COST_SETTLEMENTS, SETTLEMENT_MEANING],
    ["Checklist kind", CHECKLIST_KINDS, CHECKLIST_KIND_MEANING],
    ["Vote level", VOTE_LEVELS, VOTE_LEVEL_MEANING],
    ["Booking state", BOOKING_STATES, BOOKING_STATE_MEANING],
    ["Refundable", REFUNDABLE_VALUES, REFUNDABLE_MEANING],
    ["Review depth", REVIEW_DEPTHS, REVIEW_DEPTH_MEANING],
    ["Finding category", FINDING_CATEGORIES, FINDING_CATEGORY_MEANING],
    ["Finding state", FINDING_STATES, FINDING_STATE_MEANING],
    ["Finding severity", FINDING_SEVERITIES, FINDING_SEVERITY_MEANING],
    ["Finding origin", FINDING_ORIGINS, FINDING_ORIGIN_MEANING],
  ] as const)("%s", (_name, values, meaning) => {
    expect(Object.keys(meaning).sort()).toEqual([...values].sort());
    for (const v of values) expect((meaning as Record<string, string>)[v].length).toBeGreaterThan(5);
  });
});

it("describeValues lists only the given values", () => {
  const d = describeValues("Kind.", CHECKLIST_KIND_MEANING, ["PRETRIP", "PACKING"]);
  expect(d).toContain("PRETRIP: ");
  expect(d).toContain("PACKING: ");
  expect(d).not.toContain("SHOPPING");
});

it("server instructions carry the vocabulary that prevents the classic mis-filings", () => {
  expect(MCP_INSTRUCTIONS).toMatch(/Transport/);
  expect(MCP_INSTRUCTIONS).toMatch(/Getting around/);
  expect(MCP_INSTRUCTIONS).toMatch(/day trip/i);
  expect(MCP_INSTRUCTIONS).toMatch(/Day title/);
  expect(MCP_INSTRUCTIONS).toMatch(/Note/);
  expect(MCP_INSTRUCTIONS).toMatch(/Other cost/);
  expect(MCP_INSTRUCTIONS).toMatch(/Reminder/);
  expect(MCP_INSTRUCTIONS).toMatch(/Place/);
  expect(MCP_INSTRUCTIONS).toContain(WRITING_STYLE);
  expect(MCP_INSTRUCTIONS).toContain(CHECK_FACTS);
});

it("server instructions tell Claude about leave_feedback, the Claude-connection Feedback button (Task 13)", () => {
  expect(MCP_INSTRUCTIONS).toContain("leave_feedback sends a Feedback note to Teepee's operator");
  expect(MCP_INSTRUCTIONS).toMatch(/same as the app's Feedback button/);
  expect(MCP_INSTRUCTIONS).toMatch(/whether it is open or waiting for review/);
  const feedback = MCP_INSTRUCTIONS.slice(MCP_INSTRUCTIONS.indexOf("leave_feedback sends"), MCP_INSTRUCTIONS.indexOf(CHECK_FACTS));
  expect(feedback).not.toContain("—");
  expect(feedback).not.toContain(";");
});

it("server instructions tell Claude not to probe a Surprise kept from the Traveller it acts as (ADR 0051)", () => {
  expect(MCP_INSTRUCTIONS).toContain("surprise.youAreSurprised true");
  expect(MCP_INSTRUCTIONS).toMatch(/do not suggest, research, guess or ask what is inside it/);
  expect(MCP_INSTRUCTIONS).toContain("Just say it is a surprise planned by the person named in surprise.plannedBy.");
  expect(MCP_INSTRUCTIONS).toMatch(/set_surprise makes a Stop or item a surprise.*reveal_surprise ends it \(planner only\)/);
  // before the fact-checking rule, and in the house style
  expect(MCP_INSTRUCTIONS.indexOf("youAreSurprised")).toBeLessThan(MCP_INSTRUCTIONS.indexOf(CHECK_FACTS));
  const surprise = MCP_INSTRUCTIONS.slice(MCP_INSTRUCTIONS.indexOf("A Surprise is"), MCP_INSTRUCTIONS.indexOf(CHECK_FACTS));
  expect(surprise).not.toContain("—");
  expect(surprise).not.toContain(";");
});

it("the writing style rule bans em dashes, semicolons and hype", () => {
  expect(WRITING_STYLE).toMatch(/no em dashes/i);
  expect(WRITING_STYLE).toMatch(/no semicolons/i);
  expect(WRITING_STYLE).toMatch(/hidden gem/);
  // the rule practises what it preaches
  expect(WRITING_STYLE).not.toContain("—");
  expect(WRITING_STYLE).not.toContain(";");
});

it("enum inputs on the tools carry descriptions", async () => {
  const c = await connectTestClient();
  const tools = new Map((await c.listTools()).tools.map((t) => [t.name, t]));
  const prop = (tool: string, field: string) =>
    (tools.get(tool)!.inputSchema.properties as Record<string, { description?: string }>)[field];
  expect(prop("add_thing_to_do", "category").description).toContain("GETTING_AROUND");
  expect(prop("update_thing_to_do", "category").description).toContain("PLACE");
  expect(prop("set_vote", "level").description).toContain("MUST");
  expect(prop("add_transport", "mode").description).toContain("FLIGHT");
  expect(prop("add_checklist_item", "kind").description).toContain("PRETRIP");
  // settlement: find each tool whose input has a settlement field and assert it is described
  for (const t of tools.values()) {
    const p = (t.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
    if (p.settlement) expect(p.settlement.description, t.name).toContain("ON_TRIP");
  }
});

it("Claude reads a Fork by its on-screen name, \"What-if plan\", one way everywhere (CF-05)", async () => {
  const c = await connectTestClient();
  const { tools } = await c.listTools();
  const texts = [MCP_INSTRUCTIONS, ...tools.flatMap((t) => [t.description ?? "", JSON.stringify(t.inputSchema)])];
  for (const text of texts) {
    // Every mention is cased "What-if plan"; "Fork" is the code's word, not Claude's.
    expect(text.match(/what-if plans?/gi)?.filter((m) => !m.startsWith("What-if plan")) ?? []).toEqual([]);
    expect(text).not.toMatch(/\bforks?\b(?!Id)/i);
  }
  expect(tools.find((t) => t.name === "update_trip")!.description).toContain("every What-if plan");
});

it("a Review's depth is the same word in review_trip and in get_review (R13)", () => {
  for (const d of REVIEW_DEPTHS) expect(DEPTH_OF_REVIEW_KIND[REVIEW_KIND_OF_DEPTH[d]]).toBe(d);
  expect([...REVIEW_KINDS].sort()).toEqual(Object.keys(DEPTH_OF_REVIEW_KIND).sort());
  expect(REVIEW_KIND_OF_DEPTH).toEqual({ standard: "STANDARD", deep: "DEEP" });
});

it("every suggested fix names a real tool Claude can make the same change with", async () => {
  const c = await connectTestClient();
  const names = new Set((await c.listTools()).tools.map((t) => t.name));
  for (const [kind, how] of Object.entries(FIX_WITH_TOOL)) {
    const tool = how.split(" ")[0];
    expect(names.has(tool), `${kind} → ${tool}`).toBe(true);
  }
  // House style: the text reaches Claude verbatim.
  for (const t of [...Object.values(FIX_WITH_TOOL), ...Object.values(FINDING_STATE_MEANING), ...Object.values(REVIEW_DEPTH_MEANING)]) {
    expect(t).not.toContain("—");
    expect(t).not.toContain(";");
  }
});
