import { z } from "zod";
import { ImageValidationError, validateUploadImage } from "@/lib/image-validation";
import { runPreflight } from "@/lib/preflight/checks";
import { resolveStorage } from "@/lib/storage";
import { UPLOAD_ROLES } from "@/lib/upload-rules";

export const runtime = "nodejs";

const RoleSchema = z.enum(UPLOAD_ROLES);

function badRequest(reason: string): Response {
  return Response.json({ error: reason }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("multipart form data with 'file' and 'role' parts is required");
  }
  const role = RoleSchema.safeParse(formData.get("role"));
  if (!role.success) {
    return badRequest("role must be 'person' or 'garment'");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return badRequest("file part is required");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const image = await validateUploadImage({ bytes, fileName: file.name });
    const preflight = await runPreflight(role.data, {
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      contentType: image.contentType,
    });
    if (!preflight.ok) {
      return Response.json(
        { error: preflight.rejection.reason, code: preflight.rejection.code },
        { status: 422 },
      );
    }
    const url = await resolveStorage(process.env).put({
      bytes,
      contentType: image.contentType,
      role: role.data,
    });
    return Response.json(
      {
        url,
        role: role.data,
        width: image.width,
        height: image.height,
        contentType: image.contentType,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
