# WearLensAI MCP Server

An MCP (Model Context Protocol) server that exposes the try-on pipeline to
AI agents — the **same seams as the web app** (window validation → role
preflight → storage → engine → job store). Runs the zero-cost StubEngine
today; the day `TRYON_ENGINE=fal` flips (budget unlock), every MCP client
goes live with zero code changes.

## Tools

| Tool | Params | Returns |
|---|---|---|
| `submit_try_on` | `person_path`, `garment_path` (absolute local file paths, jpg/png/webp) | `{ ok, job_id }` or `{ ok: false, reason, code? }` with the same actionable copy as the web app's 422s |
| `get_try_on_status` | `job_id` | `{ ok, phase }`; `done` adds `result_url`, `failed` adds `reason` |
| `get_try_on_result` | `job_id` | `{ ok, result_path, result_url }` — the local file and the web-servable URL |

Images enter as file paths, never base64.

## Wire it up

### opencode

Project-local `.opencode/opencode.json` (this file is gitignored — copy from
here or create your own):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "wearlens": {
      "type": "local",
      "command": ["pnpm", "-C", "web", "mcp"],
      "enabled": true,
      "environment": {
        "TRYON_DATA_DIR": ".data"
      }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` — Claude
Desktop needs absolute paths:

```json
{
  "mcpServers": {
    "wearlens-tryon": {
      "command": "pnpm",
      "args": ["-C", "/absolute/path/to/WearLensAI/web", "mcp"],
      "env": {
        "TRYON_DATA_DIR": "/absolute/path/to/WearLensAI/web/.data"
      }
    }
  }
}
```

## Environment knobs

| Variable | Default | Meaning |
|---|---|---|
| `TRYON_DATA_DIR` | `web/.data` | Data root: uploads, `jobs.db`, stub results |
| `TRYON_ENGINE` | `stub` | `stub` now; `fal` lands with the API budget (deferred — see `src/lib/tryon/fal-engine.ts`) |
| `TRYON_STUB_QUEUED_MS` | `500` | Stub lifecycle: time in `queued` |
| `TRYON_STUB_PROCESSING_MS` | `2500` | Stub lifecycle: time in `processing` |

## Sharing state with the web app

Point both the web app and the MCP server at the same `TRYON_DATA_DIR` and
they share uploads, job rows, and results: an agent can submit a try-on and
you can open the job's result page in the browser (or vice versa).

Caveat: `jobs.db` is plain node:sqlite with default journaling — fine at
single-machine dev volume, not a multi-writer service. The deploy-time
answer is the `NeonJobStore` seam (Phase 3 Step 8).

## Testing

```bash
cd web && pnpm exec vitest run mcp
```

Covers handler units, an in-memory-transport client end-to-end (submit →
poll → result file on disk), failure paths, and the shared-db visibility.
