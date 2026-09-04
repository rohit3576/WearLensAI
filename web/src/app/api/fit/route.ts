/**
 * POST /api/fit — size advice over the store's own chart. The route
 * schemas are the authority (the extension's twins feed this); absence
 * is an answer (chartless garment → 200 with none-confidence advice),
 * only malformed input is an error — 400 naming the field and why, in
 * the upload-route copy stance. CORS is handled by the /api/* proxy.
 */
import { z } from "zod";
import { fitAdvice } from "@/lib/fit/engine";
import { BodyProfileSchema, FitAdviceSchema, GarmentProfileSchema } from "@/lib/fit/schema";

export const runtime = "nodejs";

const FitRequestSchema = z.object({
  garment: GarmentProfileSchema,
  body: BodyProfileSchema,
});

function issueText(issue: z.ZodIssue): string {
  const where = issue.path.join(".");
  if (issue.code === "invalid_type") return `${where} is required`;
  return `${where} — ${issue.message}`;
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "JSON body with garment and body is required" },
      { status: 400 },
    );
  }

  const parsed = FitRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const error = first === undefined ? "invalid request" : issueText(first);
    return Response.json({ error }, { status: 400 });
  }

  const advice = FitAdviceSchema.parse(fitAdvice(parsed.data.garment, parsed.data.body));
  return Response.json(advice, { status: 200 });
}
