import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";

beforeAll(async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mcp-smoke-"));
  process.env["TRYON_DATA_DIR"] = dataDir;
});

describe("MCP server skeleton", () => {
  it("lists the three try-on tools over an in-memory transport", async () => {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "smoke-test", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    const names = tools.map((tool) => tool.name).sort();
    expect(names).toStrictEqual(["get_try_on_result", "get_try_on_status", "submit_try_on"]);
    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(10);
    }
    await client.close();
    await server.close();
  });
});
