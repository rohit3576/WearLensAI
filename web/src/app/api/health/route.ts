export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    engine: process.env["TRYON_ENGINE"] ?? "stub",
    storage: process.env["TRYON_STORAGE"] ?? "local",
  });
}
