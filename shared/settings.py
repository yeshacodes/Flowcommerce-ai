from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    kafka_bootstrap: str = "localhost:9092"
    # Kafka auth — local default is plaintext with no credentials. Set
    # security_protocol=SASL_SSL + mechanism/username/password for Confluent Cloud.
    kafka_security_protocol: str = "PLAINTEXT"
    kafka_sasl_mechanism: str = "PLAIN"
    kafka_username: str = ""
    kafka_password: str = ""
    postgres_dsn: str = "postgresql://postgres:postgres@localhost:5432/orders"
    redis_url: str = "redis://localhost:6379/0"
    # Production frontend origin allowed by CORS (in addition to localhost dev).
    frontend_origin: str = ""
    # Inter-service base URLs (order-service calls siblings for health/copilot).
    # Localhost defaults keep local dev working; override per-service on Render.
    auth_service_url: str = "http://127.0.0.1:8004"
    catalog_service_url: str = "http://127.0.0.1:8005"
    order_service_url: str = "http://127.0.0.1:8000"
    inventory_service_url: str = "http://127.0.0.1:8001"
    payment_service_url: str = "http://127.0.0.1:8002"
    notification_service_url: str = "http://127.0.0.1:8003"
    stripe_webhook_service_url: str = "http://127.0.0.1:8006"
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
