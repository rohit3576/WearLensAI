import { UploadFlow } from "@/components/upload/upload-flow";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 md:gap-10 md:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
          See it on you before you buy
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground md:text-base">
          Upload one photo of yourself and one image of the garment. The try-on
          renders in a few seconds, then you compare before and after.
        </p>
      </header>
      <UploadFlow />
    </main>
  );
}
