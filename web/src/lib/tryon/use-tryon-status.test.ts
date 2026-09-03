// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTryOnStatus } from "./use-tryon-status";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

afterEach(() => {
  cleanup();
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("useTryOnStatus", () => {
  it("subscribes to the job's SSE endpoint on mount and closes on unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { unmount } = renderHook(() => useTryOnStatus("job-1"));

    const source = FakeEventSource.instances[0];
    if (source === undefined) throw new Error("no EventSource created");
    expect(source.url).toBe("/api/try-on/job-1/status");
    expect(source.closed).toBe(false);

    unmount();
    expect(source.closed).toBe(true);
  });

  it("returns null-phase connecting state until events arrive", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() => useTryOnStatus("job-1"));

    expect(result.current).toStrictEqual({ phase: "connecting" });
  });

  it("surfaces lifecycle events and closes at the terminal phase", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() => useTryOnStatus("job-2"));
    const source = FakeEventSource.instances[0];
    if (source === undefined) throw new Error("no EventSource created");

    act(() => source.emit({ phase: "queued" }));
    expect(result.current).toStrictEqual({ phase: "queued" });

    act(() => source.emit({ phase: "processing" }));
    expect(result.current).toStrictEqual({ phase: "processing" });

    act(() => source.emit({ phase: "done", resultUrl: "/api/results/x.png" }));
    expect(result.current).toStrictEqual({ phase: "done", resultUrl: "/api/results/x.png" });
    expect(source.closed).toBe(true);
  });

  it("keeps the failed reason and closes", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() => useTryOnStatus("job-3"));
    const source = FakeEventSource.instances[0];
    if (source === undefined) throw new Error("no EventSource created");

    act(() => source.emit({ phase: "failed", reason: "stub failure injection" }));

    expect(result.current).toStrictEqual({ phase: "failed", reason: "stub failure injection" });
    expect(source.closed).toBe(true);
  });

  it("ignores malformed event payloads", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const { result } = renderHook(() => useTryOnStatus("job-4"));
    const source = FakeEventSource.instances[0];
    if (source === undefined) throw new Error("no EventSource created");

    act(() => source.emit({ phase: "hologram", resultUrl: 42 }));

    expect(result.current).toStrictEqual({ phase: "connecting" });
  });
});
