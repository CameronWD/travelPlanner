import { describe, expect, it, vi } from "vitest";

// buildMcpServer() registers every tool group, so a prompts-only test still
// needs the whole graph to import cleanly. Nothing here ever calls a tool,
// so empty stubs are enough — same minimal shape proven by the other
// lib/mcp/tools/*.test.ts files for the modules they don't exercise.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "./test-client";

/** Every tool name each prompt's text mentions — must be a real registered tool. */
const PROMPT_TOOLS: Record<string, string[]> = {
  "review-plan": ["get_trip_plan", "get_flags", "get_budget"],
  "pack-for": ["get_trip_plan", "get_checklists", "add_checklist_item", "set_need_to_buy"],
};

function textOf(message: { content: unknown }): string {
  return (message.content as { text: string }).text;
}

describe("MCP prompts", () => {
  it("lists review-plan and pack-for", async () => {
    const c = await connectTestClient();
    const names = (await c.listPrompts()).prompts.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["review-plan", "pack-for"]));
  });

  it("interpolates tripId into review-plan", async () => {
    const c = await connectTestClient();
    const r = await c.getPrompt({ name: "review-plan", arguments: { tripId: "trip-42" } });
    expect(textOf(r.messages[0])).toContain("trip-42");
  });

  it("interpolates tripId into pack-for", async () => {
    const c = await connectTestClient();
    const r = await c.getPrompt({ name: "pack-for", arguments: { tripId: "trip-99" } });
    expect(textOf(r.messages[0])).toContain("trip-99");
  });

  it("pack-for names add_checklist_item's real kind value, PACKING", async () => {
    const c = await connectTestClient();
    const r = await c.getPrompt({ name: "pack-for", arguments: { tripId: "t1" } });
    expect(textOf(r.messages[0])).toContain("kind PACKING");
  });

  it("every tool name each prompt mentions is a registered tool", async () => {
    const c = await connectTestClient();
    const registered = new Set((await c.listTools()).tools.map((t) => t.name));
    for (const [prompt, mentioned] of Object.entries(PROMPT_TOOLS)) {
      const r = await c.getPrompt({ name: prompt, arguments: { tripId: "t1" } });
      const text = textOf(r.messages[0]);
      for (const toolName of mentioned) {
        expect(text).toContain(toolName);
        expect(registered.has(toolName)).toBe(true);
      }
    }
  });
});
