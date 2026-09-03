"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { useTryOnStatus } from "@/lib/tryon/use-tryon-status";
import type { JobPhase } from "@/lib/tryon/status";
const STATUS_MESSAGES = [
  "Reading your photo",
  "Placing the garment",
  "Blending the fit",
  "Finishing touches",
] as const;

const DEFAULT_ASPECT = "4/5" as const;

/** Everything the view needs from the job row, fetched server-side. */
export interface InitialJob {
  readonly personUrl: string;
  readonly phase: JobPhase;
  readonly resultUrl: string | null;
  readonly reason: string | null;
}

export interface TryOnViewProps {
  readonly jobId: string;
  readonly initialJob: InitialJob | null;
  readonly width?: number;
  readonly height?: number;
}

type TerminalState =
  | { readonly kind: "done"; readonly resultUrl: string }
  | { readonly kind: "failed"; readonly reason: string };

/** Merge the live SSE status with the server-rendered phase into one verdict. */
function terminalOf(
  status: ReturnType<typeof useTryOnStatus>,
  initialJob: InitialJob,
): TerminalState | null {
  if (status.phase === "done") return { kind: "done", resultUrl: status.resultUrl };
  if (status.phase === "failed") return { kind: "failed", reason: status.reason };
  if (initialJob.phase === "done" && initialJob.resultUrl !== null) {
    return { kind: "done", resultUrl: initialJob.resultUrl };
  }
  if (initialJob.phase === "failed" && initialJob.reason !== null) {
    return { kind: "failed", reason: initialJob.reason };
  }
  return null;
}

export function TryOnView({ jobId, initialJob, width, height }: TryOnViewProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const status = useTryOnStatus(initialJob === null ? null : jobId);

  const terminal = initialJob === null ? null : terminalOf(status, initialJob);
  const isLive = terminal === null;

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      setMessageIndex((index) => (index + 1) % STATUS_MESSAGES.length);
    }, 2400);
    return () => clearInterval(id);
  }, [isLive]);

  if (initialJob === null) {
    return (
      <Shell title="Try-on not found">
        <p className="text-sm text-muted-foreground">
          This try-on does not exist or has expired. Start a new one.
        </p>
        <StartOverLink />
      </Shell>
    );
  }

  const aspect =
    width !== undefined && height !== undefined
      ? `${width.toString()}/${height.toString()}`
      : DEFAULT_ASPECT;

  if (terminal?.kind === "done") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 md:py-16">
        <ResultSlider
          personUrl={initialJob.personUrl}
          resultUrl={terminal.resultUrl}
          aspect={aspect}
        />
        <StartOverLink />
      </main>
    );
  }

  if (terminal?.kind === "failed") {
    return (
      <Shell title="The try-on failed">
        <p className="text-sm text-muted-foreground">{terminal.reason}</p>
        <StartOverLink />
      </Shell>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10 md:py-16">
      <ProcessingPanel aspect={aspect} message={STATUS_MESSAGES[messageIndex] ?? ""} />
    </main>
  );
}

function ResultSlider({
  personUrl,
  resultUrl,
  aspect,
}: {
  personUrl: string;
  resultUrl: string;
  aspect: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border" style={{ aspectRatio: aspect }}>
      <ReactCompareSlider
        className="h-full w-full"
        itemOne={
          <ReactCompareSliderImage
            src={personUrl}
            alt="Before: your photo"
            style={{ height: "100%", objectFit: "contain" }}
          />
        }
        itemTwo={
          <ReactCompareSliderImage
            src={resultUrl}
            alt="After: wearing the garment"
            style={{ height: "100%", objectFit: "contain" }}
          />
        }
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs uppercase tracking-wide">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs uppercase tracking-wide">
        After
      </span>
    </div>
  );
}

function ProcessingPanel({ aspect, message }: { aspect: string; message: string }) {
  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-muted" style={{ aspectRatio: aspect }}>
        <div className="h-full w-full animate-pulse bg-muted-foreground/10" />
      </div>
      <p
        aria-live="polite"
        key={message}
        className="animate-in fade-in duration-300 text-sm text-muted-foreground"
      >
        {message}…
      </p>
    </>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-10">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <h1 className="text-lg font-medium">{title}</h1>
        {children}
      </div>
    </main>
  );
}

function StartOverLink() {
  return (
    <Link
      href="/"
      className="inline-flex h-11 w-fit items-center justify-center rounded-md border px-6 text-sm font-medium transition-colors hover:bg-muted"
    >
      Try another look
    </Link>
  );
}
