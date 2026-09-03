import { z } from "zod";
import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";

const SubmitTryOnSchema = z.object({
  personUrl: z.string().min(1),
  garmentUrl: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "JSON body with personUrl and garmentUrl is required" },
      { status: 400 },
    );
  }
  const parsed = SubmitTryOnSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "personUrl and garmentUrl are required" },
      { status: 400 },
    );
  }

  const { engine } = getRuntime();
  const jobId = await engine.submit(parsed.data);
  return Response.json({ jobId }, { status: 201 });
}
