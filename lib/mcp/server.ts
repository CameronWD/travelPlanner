/**
 * Builds the MCP server for one /api/mcp request (spec 2026-10-09). Each tool
 * group registers itself; every tool goes through runTool and the app's own
 * guards, as the acting Traveller.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTripReadTools } from "./tools/trips-read";
import { registerReadTools } from "./tools/reads";

export const MCP_INSTRUCTIONS = [
  "You are working on the user's TEEPEE trips, as them. Changes are real and visible to their travel partner, marked 'via Claude'.",
  "Vocabulary: a Stop is a place they stay; an Item is a thing to do or see; the Wishlist holds ideas not yet placed.",
  "Every tool works on the real plan. Read the plan before changing it, and say what you changed.",
].join(" ");

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "teepee", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  registerTripReadTools(server);
  registerReadTools(server);
  return server;
}
