export type StatusEvent =
  | { readonly phase: "queued" }
  | { readonly phase: "processing" }
  | { readonly phase: "done"; readonly resultUrl: string }
  | { readonly phase: "failed"; readonly reason: string };
