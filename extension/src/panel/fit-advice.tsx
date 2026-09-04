import type { FitAdvice } from "../lib/profile/schema";

const CONFIDENCE_WORDS: Record<FitAdvice["confidence"], string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence",
  none: "no size data",
};

export function FitAdviceCard({ advice }: { advice: FitAdvice }) {
  const headline =
    advice.size === undefined
      ? "No size data for this page"
      : `Size ${advice.size} — ${CONFIDENCE_WORDS[advice.confidence]}`;
  return (
    <div className="fit-advice" aria-label="Size advice">
      <p className="fit-advice-headline">{headline}</p>
      <ul className="fit-advice-reasons">
        {advice.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
