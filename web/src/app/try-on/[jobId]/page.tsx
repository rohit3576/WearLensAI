import type { Metadata } from "next";
import sharp from "sharp";
import { TryOnView } from "@/components/tryon/try-on-view";
import { getRuntime } from "@/lib/runtime";
import { JobId } from "@/lib/tryon/engine";
import { LocalStorage } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Try-on result — WearLensAI",
};

export default async function TryOnPage({
  params,
}: PageProps<"/try-on/[jobId]">) {
  const { jobId } = await params;
  const { store, storage } = getRuntime();
  const job = await store.get(JobId(jobId));
  if (job === null) {
    return <TryOnView jobId={jobId} initialJob={null} />;
  }
  const dims =
    storage instanceof LocalStorage
      ? await readImageDims(storage.pathOf(job.personUrl))
      : undefined;
  return (
    <TryOnView
      jobId={jobId}
      initialJob={{
        personUrl: job.personUrl,
        phase: job.phase,
        resultUrl: job.resultUrl,
        reason: job.reason,
      }}
      {...dims}
    />
  );
}

async function readImageDims(
  imagePath: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const meta = await sharp(imagePath).metadata();
    if (meta.width === undefined || meta.height === undefined) return undefined;
    return { width: meta.width, height: meta.height };
  } catch {
    return undefined;
  }
}
