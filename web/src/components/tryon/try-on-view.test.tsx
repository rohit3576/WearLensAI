// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TryOnView } from "./try-on-view";
import type { InitialJob } from "./try-on-view";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();

  constructor() {
    FakeEventSource.instances.push(this);
  }
}

const processingJob: InitialJob = {
  personUrl: "/api/files/person.png",
  phase: "processing",
  resultUrl: null,
  reason: null,
};

function hookSource(): FakeEventSource {
  const instance = FakeEventSource.instances[0];
  if (instance === undefined) throw new Error("hook did not create an EventSource");
  return instance;
}

function emit(data: unknown): Promise<void> {
  return act(async () => {
    hookSource().onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TryOnView", () => {
  it("shows the skeleton and the first status message while processing", () => {
    render(<TryOnView jobId="job-1" initialJob={processingJob} width={800} height={1000} />);

    expect(screen.getByText(/Reading your photo/)).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Try another look" })).toBeNull();
  });

  it("renders the slider immediately when the job is already done", () => {
    render(
      <TryOnView
        jobId="job-1"
        initialJob={{
          personUrl: "/api/files/person.png",
          phase: "done",
          resultUrl: "/api/results/job-1.png",
          reason: null,
        }}
        width={800}
        height={1000}
      />,
    );

    expect(screen.getByAltText("Before: your photo")).toBeInTheDocument();
    expect(screen.getByAltText("After: wearing the garment")).toBeInTheDocument();
    expect(screen.getByText("Before", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("After", { exact: true })).toBeInTheDocument();
  });

  it("reveals the slider when the SSE stream reports done", async () => {
    render(<TryOnView jobId="job-1" initialJob={processingJob} width={800} height={1000} />);

    await emit({ phase: "done", resultUrl: "/api/results/job-1.png" });

    await waitFor(() => {
      expect(screen.getByAltText("After: wearing the garment")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Try another look" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the failure reason when the stream reports failed", async () => {
    render(<TryOnView jobId="job-1" initialJob={processingJob} width={800} height={1000} />);

    await emit({ phase: "failed", reason: "stub failure injection" });

    await waitFor(() => {
      expect(screen.getByText("The try-on failed")).toBeInTheDocument();
    });
    expect(screen.getByText("stub failure injection")).toBeInTheDocument();
  });

  it("renders the not-found card without subscribing to a stream", () => {
    render(<TryOnView jobId="missing" initialJob={null} />);

    expect(screen.getByText("Try-on not found")).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
