/**
 * The WearLensAI MCP server surface — three tools over the same runtime
 * composition as the web app (validate → preflight → storage → engine →
 * store). Import-safe: constructing the server does NOT open stdio; the
 * entry point (index.ts) owns the transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRuntime } from "../src/lib/runtime";

export const SERVER_NAME = "wearlens-tryon" as const;
export const SERVER_VERSION = "0.1.0" as const;

export function createMcpServer(): McpServer {
  getRuntime();
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "submit_try_on",
    {
      description:
        "Submit a virtual try-on: a person photo and a garment image (absolute local file paths). " +
        "Returns a job id to poll with get_try_on_status. Rejections carry the same " +
        "actionable reasons as the web app.",
      inputSchema: {
        person_path: z.string().describe("Absolute path to the person photo (jpg/png/webp)"),
        garment_path: z.string().describe("Absolute path to the garment image (jpg/png/webp)"),
      },
    },
    () => ({
      content: [{ type: "text", text: "not implemented yet (wired in step 2)" }],
      isError: true,
    }),
  );

  server.registerTool(
    "get_try_on_status",
    {
      description:
        "Get a try-on job's status: queued, processing, done (with result URL), or failed (with reason).",
      inputSchema: {
        job_id: z.string().describe("The job id returned by submit_try_on"),
      },
    },
    () => ({
      content: [{ type: "text", text: "not implemented yet (wired in step 2)" }],
      isError: true,
    }),
  );

  server.registerTool(
    "get_try_on_result",
    {
      description:
        "Get a finished try-on's result: the local result file path and the web-servable URL.",
      inputSchema: {
        job_id: z.string().describe("The job id returned by submit_try_on"),
      },
    },
    () => ({
      content: [{ type: "text", text: "not implemented yet (wired in step 2)" }],
      isError: true,
    }),
  );

  return server;
}
