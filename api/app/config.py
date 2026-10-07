from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./tattoo.db"
    jwt_secret: str = "dev-secret"
    jwt_expire_minutes: int = 720
    media_dir: str = "./media"
    cors_origins: str = "http://localhost:5173"
    root_path: str = ""          # "/api" detrás de Nginx
    admin_email: str = ""        # si se define, crea el admin y los datos iniciales al arrancar
    admin_password: str = ""

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    evolution_url: str = ""
    evolution_api_key: str = ""
    evolution_instance: str = ""


settings = Settings()
