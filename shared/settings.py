from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    kafka_bootstrap: str = "localhost:9092"
    postgres_dsn: str = "postgresql://postgres:postgres@localhost:5432/orders"
    redis_url: str = "redis://localhost:6379/0"
    payment_failure_rate: float = 0.2
    max_retries: int = 3
    jwt_secret: str = "change-me-in-production"
    jwt_expiry_hours: int = 24
    resend_api_key: str = ""
    from_email: str = "onboarding@resend.dev"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    # AI Copilot (Phase 2, optional). When openai_api_key is set, /admin/copilot/query
    # uses an OpenAI-compatible LLM; otherwise it falls back to the rule-based engine.
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
