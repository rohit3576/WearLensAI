"use client";

import { useEffect, useState } from "react";
import { StatusEventSchema } from "./status";
import type { StatusEvent } from "./status";

export type LiveStatus = { readonly phase: "connecting" } | StatusEvent;

/**
 * Native EventSource subscription to a job's SSE stream. EventSource
 * auto-reconnects on transient errors; the stream closes itself on the
 * terminal phase and so does this subscription.
 */
export function useTryOnStatus(jobId: string | null): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>({ phase: "connecting" });
  const [subscribedJobId, setSubscribedJobId] = useState<string | null>(jobId);

  if (subscribedJobId !== jobId) {
    setSubscribedJobId(jobId);
    setStatus({ phase: "connecting" });
  }

  useEffect(() => {
    if (jobId === null) return;
    const source = new EventSource(`/api/try-on/${jobId}/status`);
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = StatusEventSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;
      setStatus(parsed.data);
      if (parsed.data.phase === "done" || parsed.data.phase === "failed") {
        source.close();
      }
    };
    return () => source.close();
  }, [jobId]);

  return status;
}
