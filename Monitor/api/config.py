from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_user: str = "netmonitor"
    postgres_password: str = ""
    postgres_db: str = "netmonitor"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # Default: loopback when API runs on same host as AdGuard (LAN IP can 401 from localhost).
    adguard_url: str = "http://127.0.0.1:3000"
    adguard_user: str = "admin"
    adguard_password: str = ""

    poll_interval_sec: int = 120
    # How often to pull query log into Postgres (adguard_queries); separate from stats/traffic.
    adguard_query_poll_sec: int = 300
    network_cidr: str = "192.168.0.0/24"
    # Optional: Linux interface name for ARP (e.g. eth0, bond0, ovs_eth0). Leave unset to let scapy choose.
    scan_iface: str | None = None

    # TP-Link TL-SG108PE switch
    switch_url: str = "http://192.168.0.105"
    switch_user: str = "admin"
    switch_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def db_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
