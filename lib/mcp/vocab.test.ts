import { describe, expect, it } from "vitest";
import { CATEGORY_VALUES } from "@/lib/categories";
import { TRANSPORT_MODES, COST_SETTLEMENTS, CHECKLIST_KINDS, VOTE_LEVELS } from "@/lib/enum-values";
import {
  CATEGORY_MEANING,
  TRANSPORT_MODE_MEANING,
  SETTLEMENT_MEANING,
  CHECKLIST_KIND_MEANING,
  VOTE_LEVEL_MEANING,
  WRITING_STYLE,
  CHECK_FACTS,
  describeValues,
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
