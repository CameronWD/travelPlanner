import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next boundary that has no meaning outside a real request
// (revalidatePath/revalidateTag) — everything else, including @/lib/guards,
// runs for real: the whole point of this test is the real acting-traveller
// guard, not a stand-in for it. See test/integration/locking.test.ts for the
// same pattern.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/mcp/tokens";
import { NOT_FOUND_TEXT } from "@/lib/mcp/run-tool";
import { POST } from "@/app/api/mcp/route";

const TRIP_ID = "it-trip-mcp";
const USER_A = "mcp-a";
const USER_B = "mcp-b";

const TOKEN_A = generateToken();
const TOKEN_B = generateToken();
const TOKEN_REVOKED = generateToken();

function rpc(token: string, body: unknown): Request {
  return new Request("http://x/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function toolCall(id: number, name: string, args: Record<string, unknown>) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

describe.skipIf(process.env.INTEGRATION !== "1")("/api/mcp end to end (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER_A }, update: {}, create: { id: USER_A, email: "mcp-a@example.test", name: "Mcp A" } });
    await db.user.upsert({ where: { id: USER_B }, update: {}, create: { id: USER_B, email: "mcp-b@example.test", name: "Mcp B" } });

    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "MCP integration trip",
        homeCurrency: "AUD",
        createdById: USER_A,
        members: { create: { userId: USER_A, role: "owner" } }, // mcp-b is deliberately NOT a member
      },
    });

    await db.mcpToken.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await db.mcpToken.createMany({
      data: [
        { id: "it-mcp-token-a", userId: USER_A, label: "it-a", tokenHash: hashToken(TOKEN_A) },
        { id: "it-mcp-token-b", userId: USER_B, label: "it-b", tokenHash: hashToken(TOKEN_B) },
        { id: "it-mcp-token-revoked", userId: USER_A, label: "it-revoked", tokenHash: hashToken(TOKEN_REVOKED), revokedAt: new Date() },
      ],
    });
  });

  afterAll(async () => {
    await db.mcpToken.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  });

  it("mcp-a's add_stop creates a rough Stop and an Activity row marked via Claude", async () => {
    const res = await POST(rpc(TOKEN_A, toolCall(1, "add_stop", { tripId: TRIP_ID, name: "Lisbon", countryCode: "pt", nights: 3 })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBeFalsy();

    const stop = await db.stop.findFirst({ where: { tripId: TRIP_ID, name: "Lisbon" } });
    expect(stop).not.toBeNull();
    expect(stop?.nights).toBe(3);
    expect(stop?.countryCode).toBe("pt");

    const activity = await db.activity.findFirst({ where: { tripId: TRIP_ID, entityType: "STOP", entityId: stop!.id } });
    expect(activity?.actorId).toBe(USER_A);
    expect(activity?.source).toBe("CLAUDE");
  });

  it("mcp-b's get_trip_plan on a trip they aren't on returns the same not-found tool error as a made-up id", async () => {
    const res = await POST(rpc(TOKEN_B, toolCall(2, "get_trip_plan", { tripId: TRIP_ID })));
    expect(res.status).toBe(200); // the transport answers 200; the tool result itself is the error
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe(NOT_FOUND_TEXT);
  });

  it("a revoked token gets a bare 401", async () => {
    const res = await POST(rpc(TOKEN_REVOKED, toolCall(3, "get_trip_plan", { tripId: TRIP_ID })));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
