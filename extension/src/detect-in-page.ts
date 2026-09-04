import { detectGarmentCandidates } from "./lib/detect";

(globalThis as { __wearlensCandidates?: unknown }).__wearlensCandidates =
  detectGarmentCandidates(document);
