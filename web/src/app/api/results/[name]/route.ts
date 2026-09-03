import { readImageFrom } from "@/lib/file-serving";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params;
  const { resultsDir } = getRuntime();
  const image = await readImageFrom(resultsDir, name);
  if (image === null) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(image.bytes), {
    headers: { "Content-Type": image.contentType },
  });
}
