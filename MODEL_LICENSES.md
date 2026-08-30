# Model Licenses

This project uses pretrained virtual try-on (VTON) models. **Each model keeps its own license** — this repository's MIT license covers code only.

Weights are **never redistributed** in this repo. Users download them from the official sources listed below.

| Model | Used in | License | Permitted use | Official source |
|---|---|---|---|---|
| FASHN v1.6 (API) | Phase 1 benchmark | fal.ai API terms | commercial | https://fal.ai/models/fashn-ai/fashn-v1.6 |
| FLUX VTO (API) | Phase 1 benchmark | fal.ai API terms | commercial | https://fal.ai |
| FASHN v1.5 | Phase 6 self-host | Apache-2.0 | commercial | https://github.com/fashn-AI/fashn-vton-1.5 |
| DeCo-VTON (optional) | benchmark only | CC BY-NC-SA 4.0 | research only — never on the demo path | HuggingFace / ECCV 2026 paper |

Rules:

1. Code in this repo: MIT (see [LICENSE](LICENSE)).
2. Model weights: original license, never redistributed — official download links only.
3. Non-commercial models (CC BY-NC-SA) are used for benchmarking/research narrative only, never in the public demo path.
4. This file is updated in every phase that adds or evaluates models (next: Phase 1 benchmark verification).
