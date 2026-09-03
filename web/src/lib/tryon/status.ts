/**
 * Job status types shared by server and browser code. Sharp-free on
 * purpose: client bundles import from here (see use-tryon-status.ts).
 */
import { z } from "zod";

export type StatusEvent =
  | { readonly phase: "queued" }
  | { readonly phase: "processing" }
  | { readonly phase: "done"; readonly resultUrl: string }
  | { readonly phase: "failed"; readonly reason: string };

export const StatusEventSchema = z.union([
  z.object({ phase: z.literal("queued") }),
  z.object({ phase: z.literal("processing") }),
  z.object({ phase: z.literal("done"), resultUrl: z.string() }),
  z.object({ phase: z.literal("failed"), reason: z.string() }),
]);

export function isTerminalPhase(
  event: StatusEvent,
): event is Extract<StatusEvent, { phase: "done" | "failed" }> {
  return event.phase === "done" || event.phase === "failed";
}
