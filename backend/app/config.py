from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Database settings
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/maildb"
    
    # JWT settings
    SECRET_KEY: str = "your-secret-key-here"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # SMTP Settings for local server
    SMTP_HOST: str = "host.docker.internal"  # Special Docker DNS for host machine
    SMTP_PORT: int = 25  # Default SMTP port
    SMTP_USERNAME: str = ""  # Usually not needed for local SMTP
    SMTP_PASSWORD: str = ""  # Usually not needed for local SMTP
    SMTP_TLS: bool = False  # Local SMTP usually doesn't use TLS
    SMTP_SSL: bool = False
    FROM_EMAIL: str = "noreply@localhost"
    FROM_NAME: str = "Mail Service"

    # GIPHY Settings
    GIPHY_API_KEY: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()

# Example usage:
# settings = get_settings()
# smtp_settings = {
#     "MAIL_USERNAME": settings.MAIL_USERNAME,
#     "MAIL_PASSWORD": settings.MAIL_PASSWORD,
#     "MAIL_FROM": settings.MAIL_FROM,
#     "MAIL_PORT": settings.MAIL_PORT,
#     "MAIL_SERVER": settings.MAIL_SERVER,
#     "MAIL_TLS": settings.MAIL_TLS,
#     "MAIL_SSL": settings.MAIL_SSL,
#     "USE_CREDENTIALS": settings.USE_CREDENTIALS
# }
