import { LocalStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params;
  const storage = new LocalStorage({ rootDir: process.env["TRYON_DATA_DIR"] ?? ".data" });
  const stored = await storage.read(name);
  if (stored === null) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(stored.bytes), {
    headers: { "Content-Type": stored.contentType },
  });
}
