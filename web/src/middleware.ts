import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS for API routes — browser-extension clients (the WearLensAI side
 * panel runs on a chrome-extension:// origin). Same-origin web traffic is
 * unaffected; no credentials are ever sent, so a wildcard origin is safe
 * for these public try-on endpoints.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(corsHeaders())) {
    response.headers.set(name, value);
  }
  return response;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const config = {
  matcher: "/api/:path*",
};
