"""FLUX Pro v1 VTO adapter (fal.ai-hosted).

Schema verified 2026-09-01 from https://fal.ai/models/fal-ai/flux-pro/v1/vto/api
and its llms.txt:

- request: ``prompt`` (REQUIRED — styling instructions), ``human_image_url``,
  ``garment_image_url``; optionals omitted (output_format=jpeg default)
- response: ``images: [{url, width, height}]`` + ``seed``, ``prompt``,
  ``has_nsfw_concepts``, ``timings``
- pricing: per-megapixel — $0.0375 first input MP + $0.005/extra input MP +
  $0.005/output MP; ~$0.0475 for typical 1 MP inputs
- limits: human image <= 2 MP (recommend < 1 MP), garment <= 1 MP
"""

from __future__ import annotations

from typing import ClassVar, Final, final, override

from ai.adapters.base import InputBudget
from ai.adapters.fal import FalTryOnAdapter, JsonValue

FLUX_VTO_MODEL_ID: Final = "fal-ai/flux-pro/v1/vto"
FLUX_PRICE_PER_GENERATION_USD: Final = 0.0475
FLUX_PERSON_MAX_MP: Final = 2.0
FLUX_GARMENT_MAX_MP: Final = 1.0
FLUX_INPUT_BUDGET: Final = InputBudget(
    person=FLUX_PERSON_MAX_MP, garment=FLUX_GARMENT_MAX_MP
)
DEFAULT_PROMPT: Final = (
    "A natural front-facing studio photo of the person wearing the garment."
)


@final
class FluxVtoAdapter(FalTryOnAdapter):
    """FLUX Pro v1 VTO via the fal.ai queue API."""

    name: ClassVar[str] = "flux_vto"
    model_id: ClassVar[str] = FLUX_VTO_MODEL_ID
    price_per_generation_usd: ClassVar[float] = FLUX_PRICE_PER_GENERATION_USD
    input_budget: ClassVar[InputBudget] = FLUX_INPUT_BUDGET

    @override
    def _build_arguments(
        self, *, person_url: str, garment_url: str
    ) -> dict[str, JsonValue]:
        return {
            "prompt": DEFAULT_PROMPT,
            "human_image_url": person_url,
            "garment_image_url": garment_url,
        }
