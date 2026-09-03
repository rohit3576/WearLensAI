/**
 * MCP entry point — stdio transport. Spawned by MCP clients via
 * `pnpm -C web mcp`. Logging goes to stderr only: stdout is the protocol.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main().catch((error: unknown) => {
  console.error("wearlens-tryon MCP server failed:", error);
  process.exit(1);
});
