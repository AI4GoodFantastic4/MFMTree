import argparse
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class ProcessorConfig:
    target_region: str
    aoi_asset: str | None
    output_bucket: str | None
    output_prefix: str
    start_date: str
    end_date: str
    export_scale: int
    grid_size_m: int
    dry_run: bool
    max_concurrent_tasks: int
    service_account_email: str | None
    service_account_key_path: str | None
    gee_project: str | None
    auth_mode: str
    score_version: str
    run_timestamp: str

    def to_metadata(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("service_account_key_path", None)
        return data


def parse_args(argv: list[str] | None = None) -> ProcessorConfig:
    parser = argparse.ArgumentParser(description="Run the RestoreAI Earth Engine processing pipeline.")
    parser.add_argument("--target-region", default=os.getenv("TARGET_REGION", "ethiopia"))
    parser.add_argument("--aoi-asset", default=os.getenv("GEE_AOI_ASSET"))
    parser.add_argument("--output-bucket", default=os.getenv("GEE_OUTPUT_BUCKET"))
    parser.add_argument("--output-prefix", default=os.getenv("GEE_OUTPUT_PREFIX", "reforestation/processed"))
    parser.add_argument("--start-date", default=os.getenv("GEE_START_DATE", "2020-01-01"))
    parser.add_argument("--end-date", default=os.getenv("GEE_END_DATE", "2025-12-31"))
    parser.add_argument("--export-scale", type=int, default=int(os.getenv("GEE_EXPORT_SCALE", "250")))
    parser.add_argument("--grid-size-m", type=int, default=int(os.getenv("GEE_GRID_SIZE_M", "10000")))
    parser.add_argument("--dry-run", action="store_true", default=os.getenv("GEE_DRY_RUN", "false").lower() == "true")
    parser.add_argument("--max-concurrent-tasks", type=int, default=int(os.getenv("GEE_MAX_CONCURRENT_TASKS", "3")))
    parser.add_argument("--service-account-email", default=os.getenv("GEE_SERVICE_ACCOUNT_EMAIL"))
    parser.add_argument("--service-account-key-path", default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    parser.add_argument("--gee-project", default=os.getenv("GEE_PROJECT"))
    parser.add_argument(
        "--auth-mode",
        choices=["local", "service_account", "default"],
        default=os.getenv("GEE_AUTH_MODE", "default"),
    )
    parser.add_argument("--score-version", default=os.getenv("GEE_SCORE_VERSION", "restoreai-ee-v0.1.0"))

    args = parser.parse_args(argv)
    return ProcessorConfig(
        target_region=args.target_region,
        aoi_asset=args.aoi_asset,
        output_bucket=args.output_bucket,
        output_prefix=args.output_prefix.strip("/"),
        start_date=args.start_date,
        end_date=args.end_date,
        export_scale=args.export_scale,
        grid_size_m=args.grid_size_m,
        dry_run=args.dry_run,
        max_concurrent_tasks=args.max_concurrent_tasks,
        service_account_email=args.service_account_email,
        service_account_key_path=args.service_account_key_path,
        gee_project=args.gee_project,
        auth_mode=args.auth_mode,
        score_version=args.score_version,
        run_timestamp=datetime.now(timezone.utc).isoformat(),
    )


def validate_config(config: ProcessorConfig) -> list[str]:
    warnings: list[str] = []
    if not config.dry_run and not config.output_bucket:
        warnings.append("output_bucket is required for real exports; dry-run can omit it.")
    if config.auth_mode == "service_account" and not config.service_account_email:
        warnings.append("GEE_SERVICE_ACCOUNT_EMAIL or --service-account-email is required for service_account auth.")
    if config.auth_mode == "service_account" and not config.service_account_key_path:
        warnings.append("GOOGLE_APPLICATION_CREDENTIALS or --service-account-key-path is required for service_account auth.")
    if config.export_scale <= 0:
        warnings.append("export_scale must be positive.")
    if config.grid_size_m <= 0:
        warnings.append("grid_size_m must be positive.")
    return warnings
