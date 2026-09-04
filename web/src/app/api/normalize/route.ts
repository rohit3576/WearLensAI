/**
 * POST /api/normalize — enrich a chartless deterministic extraction
 * with the configured normalizer (rules passthrough by default; llm
 * behind TRYON_NORMALIZER=llm). The payload is public page material
 * only (tables + ld+json, capped); a null profile is a valid answer.
 * 400s name the field and why, in the upload-route copy stance.
 */
import { z } from "zod";
import { getNormalizer, RawPageContentSchema } from "@/lib/fit/normalizer";
import { GarmentProfileSchema } from "@/lib/fit/schema";

export const runtime = "nodejs";

const NormalizeRequestSchema = z.object({
  sourceUrl: z.string().min(1),
  deterministic: GarmentProfileSchema.optional(),
  raw: RawPageContentSchema,
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
      { error: "JSON body with sourceUrl, deterministic, and raw is required" },
      { status: 400 },
    );
  }

  const parsed = NormalizeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const error = first === undefined ? "invalid request" : issueText(first);
    return Response.json({ error }, { status: 400 });
  }

  const profile = await getNormalizer().normalize({
    sourceUrl: parsed.data.sourceUrl,
    deterministic: parsed.data.deterministic,
    raw: parsed.data.raw,
  });
  return Response.json({ profile: profile ?? null }, { status: 200 });
}
