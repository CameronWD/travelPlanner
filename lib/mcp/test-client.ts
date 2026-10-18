import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, type McpCaller } from "./server";

/**
 * Test helper: an MCP client wired to a fresh server in memory. By default
 * the caller may run Reviews, so every tool is listed (write-returns walks
 * them all). Pass `{ reviewPermission: "OFF" }` to see what an Off caller sees.
 */
export async function connectTestClient(caller: McpCaller = { reviewPermission: "UNLIMITED" }): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(caller).connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}
