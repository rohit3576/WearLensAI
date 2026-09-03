import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { EngineNotImplementedError, resolveEngine } from "./engine";
import { StubEngine } from "./stub-engine";

describe("resolveEngine", () => {
  it("defaults to the stub engine when TRYON_ENGINE is unset", () => {
    const engine = resolveEngine({});
    expect(engine).toBeInstanceOf(StubEngine);
  });

  it("selects the stub engine explicitly", () => {
    const engine = resolveEngine({ TRYON_ENGINE: "stub" });
    expect(engine).toBeInstanceOf(StubEngine);
  });

  it("throws EngineNotImplementedError for the deferred fal engine", () => {
    expect(() => resolveEngine({ TRYON_ENGINE: "fal" })).toThrow(EngineNotImplementedError);
  });

  it("rejects an unknown engine name instead of silently downgrading", () => {
    expect(() => resolveEngine({ TRYON_ENGINE: "gpt-vision" })).toThrow(ZodError);
  });
});
