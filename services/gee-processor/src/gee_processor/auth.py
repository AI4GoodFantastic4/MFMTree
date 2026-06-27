from __future__ import annotations

from .config import ProcessorConfig


def initialize_earth_engine(config: ProcessorConfig) -> None:
    import ee

    project_kwargs = {"project": config.gee_project} if config.gee_project else {}

    if config.auth_mode == "service_account":
        if not config.service_account_email or not config.service_account_key_path:
            raise ValueError("service_account auth requires email and key path.")
        credentials = ee.ServiceAccountCredentials(config.service_account_email, config.service_account_key_path)
        ee.Initialize(credentials, **project_kwargs)
        return

    if config.auth_mode == "local":
        try:
            ee.Initialize(**project_kwargs)
        except Exception:
            ee.Authenticate()
            ee.Initialize(**project_kwargs)
        return

    ee.Initialize(**project_kwargs)
