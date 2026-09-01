"""Benchmark run records, JSONL round-trip, and per-candidate statistics."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ai.adapters.base import AdapterError


@dataclass(frozen=True, slots=True)
class RunRecord:
    """Outcome of one candidate x person x garment run."""

    candidate: str
    person: str
    garment: str
    ok: bool
    latency_s: float | None
    result_url: str | None
    result_path: str | None
    error: str | None

    def to_json_line(self) -> str:
        """Serialize to one JSONL line."""
        return json.dumps(
            {
                "candidate": self.candidate,
                "person": self.person,
                "garment": self.garment,
                "ok": self.ok,
                "latency_s": self.latency_s,
                "result_url": self.result_url,
                "result_path": self.result_path,
                "error": self.error,
            }
        )


def record_from_json_line(line: str) -> RunRecord:
    """Parse one JSONL line back into a RunRecord."""
    raw = json.loads(line)
    return RunRecord(
        candidate=raw["candidate"],
        person=raw["person"],
        garment=raw["garment"],
        ok=raw["ok"],
        latency_s=raw["latency_s"],
        result_url=raw["result_url"],
        result_path=raw["result_path"],
        error=raw["error"],
    )


def error_text(err: AdapterError | None) -> str | None:
    """Render an adapter error for storage; None stays None."""
    if err is None:
        return None
    return f"{type(err).__name__}: {err}"


@dataclass(frozen=True, slots=True)
class CandidateSummary:
    """Aggregated stats for one candidate across all its runs."""

    candidate: str
    total: int
    successes: int
    success_rate: float
    mean_latency_s: float | None
    p95_latency_s: float | None
    est_cost_usd: float


def summarize(
    records: tuple[RunRecord, ...], price_per_generation_usd: float
) -> CandidateSummary:
    """Aggregate runs of one candidate into a summary."""
    latencies = sorted(r.latency_s for r in records if r.latency_s is not None)
    successes = sum(1 for r in records if r.ok)
    mean_latency = (
        sum(latencies) / len(latencies) if latencies else None
    )
    p95_latency = (
        latencies[min(len(latencies) - 1, int(0.95 * len(latencies)))]
        if latencies
        else None
    )
    return CandidateSummary(
        candidate=records[0].candidate if records else "",
        total=len(records),
        successes=successes,
        success_rate=(successes / len(records)) if records else 0.0,
        mean_latency_s=mean_latency,
        p95_latency_s=p95_latency,
        est_cost_usd=successes * price_per_generation_usd,
    )


def write_results_jsonl(records: tuple[RunRecord, ...], path: Path) -> None:
    """Append-safe write of all records to a JSONL file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(f"{r.to_json_line()}\n" for r in records), encoding="utf-8"
    )


def read_results_jsonl(path: Path) -> tuple[RunRecord, ...]:
    """Read records from a JSONL file written by write_results_jsonl."""
    return tuple(
        record_from_json_line(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    )
