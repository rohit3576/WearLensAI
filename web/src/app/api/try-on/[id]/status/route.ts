import { getRuntime } from "@/lib/runtime";
import { JobId } from "@/lib/tryon/engine";
import type { StoredJob } from "@/lib/tryon/job-store";
import { isTerminalPhase } from "@/lib/tryon/status";
import type { StatusEvent } from "@/lib/tryon/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 300;

function eventOf(job: StoredJob): StatusEvent {
  switch (job.phase) {
    case "queued":
      return { phase: "queued" };
    case "processing":
      return { phase: "processing" };
    case "done":
      return { phase: "done", resultUrl: job.resultUrl ?? "" };
    case "failed":
      return { phase: "failed", reason: job.reason ?? "unknown failure" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const jobId = JobId(id);
  const { store } = getRuntime();
  const initial = await store.get(jobId);
  if (initial === null) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      let lastKey = "";
      const send = (job: StoredJob): void => {
        if (cancelled) return;
        const event = eventOf(job);
        const key = `${event.phase}:${"resultUrl" in event ? event.resultUrl : ""}`;
        if (key === lastKey) return;
        lastKey = key;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send(initial);
      while (!isTerminalPhase(eventOf(initial))) {
        await sleep(POLL_MS);
        if (cancelled || request.signal.aborted) break;
        const job = await store.get(jobId);
        if (job === null) break;
        send(job);
        if (isTerminalPhase(eventOf(job))) break;
      }
      if (!cancelled) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
