"""Runtime settings parsed from environment / .env (parse, don't validate)."""

from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration.

    Missing values default to empty strings; adapters raise a typed error at
    call time when a key they need is absent, so offline tools (report
    builder, tests) never require keys.
    """

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env", frozen=True, extra="ignore"
    )

    fal_key: str = ""
    tryon_adapter: str = "fashn_v1_6"
    tryon_timeout_s: float = 120.0
    resize_cache_dir: str = "output/cache/resized"


def load_settings() -> Settings:
    """Load settings from the process environment and .env file."""
    return Settings()
