"""Runtime settings parsed from environment / .env (parse, don't validate)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration. Missing values default to empty strings;
    adapters raise a typed error at call time when a key they need is absent,
    so offline tools (report builder, tests) never require keys.
    """

    model_config = SettingsConfigDict(env_file=".env", frozen=True, extra="ignore")

    fal_key: str = ""


def load_settings() -> Settings:
    """Load settings from the process environment and .env file."""
    return Settings()
