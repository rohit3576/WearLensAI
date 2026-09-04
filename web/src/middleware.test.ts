import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

describe("CORS middleware", () => {
  it("adds wildcard origin headers to API responses", () => {
    const response = middleware(request("GET", "/api/health"));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("answers preflight OPTIONS with 204 and allow headers", () => {
    const response = middleware(request("OPTIONS", "/api/try-on"));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });
});
