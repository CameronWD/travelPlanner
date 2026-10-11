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
import { WRITING_STYLE, CHECK_FACTS } from "./vocab";

/** Every tool name each prompt's text mentions — must be a real registered tool. */
const PROMPT_TOOLS: Record<string, string[]> = {
  "review-plan": ["get_trip_plan", "get_flags", "get_budget"],
  "pack-for": ["get_trip_plan", "get_checklists", "add_checklist_item", "set_need_to_buy"],
  "plan-day": ["get_trip_plan", "get_wishlist", "list_attachments", "search_places", "schedule_thing_to_do", "add_thing_to_do", "set_day_title"],
  "check-day": ["get_trip_plan", "list_attachments", "search_places"],
};

/** Prompts that need a date argument alongside tripId. */
const PROMPT_EXTRA_ARGS: Record<string, Record<string, string>> = {
  "plan-day": { date: "2026-12-18" },
  "check-day": { date: "2026-12-18" },
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
      const r = await c.getPrompt({ name: prompt, arguments: { tripId: "t1", ...PROMPT_EXTRA_ARGS[prompt] } });
      const text = textOf(r.messages[0]);
      for (const toolName of mentioned) {
        expect(text).toContain(toolName);
        expect(registered.has(toolName)).toBe(true);
      }
    }
  });

  it("plan-day carries the date and brief, and builds real things to do, never a note", async () => {
    const c = await connectTestClient();
    const r = await c.getPrompt({ name: "plan-day", arguments: { tripId: "t1", date: "2026-12-18", brief: "castle in the afternoon" } });
    const t = textOf(r.messages[0]);
    expect(t).toContain("2026-12-18");
    expect(t).toContain("castle in the afternoon");
    expect(t).toMatch(/never put the schedule in a note/i);
    expect(t).toMatch(/change nothing until I agree/i);
  });

  it("plan-day without a brief still reads cleanly", async () => {
    const c = await connectTestClient();
    const r = await c.getPrompt({ name: "plan-day", arguments: { tripId: "t1", date: "2026-12-18" } });
    expect(textOf(r.messages[0])).not.toContain("undefined");
  });

  it("both day prompts run the logistics check with travel options and verified/unverified marks", async () => {
    const c = await connectTestClient();
    for (const name of ["plan-day", "check-day"]) {
      const t = textOf((await c.getPrompt({ name, arguments: { tripId: "t1", date: "2026-12-18" } })).messages[0]);
      expect(t).toMatch(/walk/i);
      expect(t).toMatch(/train|metro/i);
      expect(t).toMatch(/bus/i);
      expect(t).toMatch(/car|taxi/i);
      expect(t).toMatch(/opening hours/i);
      expect(t).toMatch(/unverified/i);
    }
  });

  it("check-day changes nothing until agreed", async () => {
    const c = await connectTestClient();
    const t = textOf((await c.getPrompt({ name: "check-day", arguments: { tripId: "t1", date: "2026-12-18" } })).messages[0]);
    expect(t).toMatch(/change nothing until I agree/i);
  });

  it("plan-day and check-day both carry the writing style and fact-checking rules", async () => {
    const c = await connectTestClient();
    for (const name of ["plan-day", "check-day"]) {
      const t = textOf((await c.getPrompt({ name, arguments: { tripId: "t1", date: "2026-12-18" } })).messages[0]);
      expect(t).toContain(WRITING_STYLE);
      expect(t).toContain(CHECK_FACTS);
    }
  });
});
