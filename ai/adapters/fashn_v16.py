"""FASHN v1.6 try-on adapter (fal.ai-hosted).

Schema verified 2026-09-01 from https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api
and https://docs.fashn.ai/api-reference/tryon-v1-6:

- request: ``model_image`` + ``garment_image`` (URLs); optionals omitted so the
  documented defaults apply (category=auto, mode=balanced, moderation=permissive)
- response: ``images: [{url}]`` — CDN URLs valid ~3 days
- pricing: $0.075 per generation
"""

from __future__ import annotations

from typing import ClassVar, Final, final, override

from ai.adapters.base import InputBudget
from ai.adapters.fal import FalTryOnAdapter, JsonValue

FASHN_V1_6_MODEL_ID: Final = "fal-ai/fashn/tryon/v1.6"
FASHN_PRICE_PER_GENERATION_USD: Final = 0.075
FASHN_INPUT_BUDGET: Final = InputBudget(person=None, garment=None)


@final
class FashnV16Adapter(FalTryOnAdapter):
    """FASHN v1.6 via the fal.ai queue API."""

    name: ClassVar[str] = "fashn_v1_6"
    model_id: ClassVar[str] = FASHN_V1_6_MODEL_ID
    price_per_generation_usd: ClassVar[float] = FASHN_PRICE_PER_GENERATION_USD
    input_budget: ClassVar[InputBudget] = FASHN_INPUT_BUDGET

    @override
    def _build_arguments(
        self, *, person_url: str, garment_url: str
    ) -> dict[str, JsonValue]:
        return {
            "model_image": person_url,
            "garment_image": garment_url,
        }
