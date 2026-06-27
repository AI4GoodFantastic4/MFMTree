from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import ProcessorConfig


def output_name(config: ProcessorConfig, suffix: str) -> str:
    return f"{config.output_prefix.rstrip('/')}/{suffix}".strip("/")


def build_export_tasks(config: ProcessorConfig, aoi, grid_scores, score_stack) -> list[dict[str, Any]]:
    import ee

    if not config.output_bucket:
        raise ValueError("output_bucket is required to build Cloud Storage export tasks.")

    sorted_grid_scores = grid_scores.sort("restoration_score", False)
    top_cells = sorted_grid_scores.filter(ee.Filter.eq("candidate_ok", 1)).limit(30)

    return [
        {
            "name": "scored_areas_csv",
            "kind": "table",
            "uri": f"gs://{config.output_bucket}/{output_name(config, 'scored_areas')}.csv",
            "task": ee.batch.Export.table.toCloudStorage(
                collection=sorted_grid_scores,
                description="restoreai_scored_areas_csv",
                bucket=config.output_bucket,
                fileNamePrefix=output_name(config, "scored_areas"),
                fileFormat="CSV",
            ),
        },
        {
            "name": "scored_areas_geojson",
            "kind": "table",
            "uri": f"gs://{config.output_bucket}/{output_name(config, 'scored_areas')}.geojson",
            "task": ee.batch.Export.table.toCloudStorage(
                collection=sorted_grid_scores,
                description="restoreai_scored_areas_geojson",
                bucket=config.output_bucket,
                fileNamePrefix=output_name(config, "scored_areas"),
                fileFormat="GeoJSON",
            ),
        },
        {
            "name": "top_candidate_cells_kml",
            "kind": "table",
            "uri": f"gs://{config.output_bucket}/{output_name(config, 'top_candidate_cells')}.kml",
            "task": ee.batch.Export.table.toCloudStorage(
                collection=top_cells,
                description="restoreai_top_candidate_cells_kml",
                bucket=config.output_bucket,
                fileNamePrefix=output_name(config, "top_candidate_cells"),
                fileFormat="KML",
            ),
        },
        {
            "name": "restoration_score_raster",
            "kind": "image",
            "uri": f"gs://{config.output_bucket}/{output_name(config, 'restoration_score_raster')}.tif",
            "task": ee.batch.Export.image.toCloudStorage(
                image=score_stack.select("restoration_score").toFloat(),
                description="restoreai_restoration_score_raster_geotiff",
                bucket=config.output_bucket,
                fileNamePrefix=output_name(config, "restoration_score_raster"),
                region=aoi,
                scale=config.export_scale,
                crs="EPSG:3857",
                maxPixels=1e13,
                fileFormat="GeoTIFF",
                formatOptions={"cloudOptimized": True},
            ),
        },
    ]


def dry_run_export_plan(config: ProcessorConfig) -> list[dict[str, str]]:
    bucket = config.output_bucket or "DRY_RUN_BUCKET"
    return [
        {"name": "scored_areas_csv", "kind": "table", "uri": f"gs://{bucket}/{output_name(config, 'scored_areas')}.csv"},
        {"name": "scored_areas_geojson", "kind": "table", "uri": f"gs://{bucket}/{output_name(config, 'scored_areas')}.geojson"},
        {"name": "top_candidate_cells_kml", "kind": "table", "uri": f"gs://{bucket}/{output_name(config, 'top_candidate_cells')}.kml"},
        {
            "name": "restoration_score_raster",
            "kind": "image",
            "uri": f"gs://{bucket}/{output_name(config, 'restoration_score_raster')}.tif",
        },
    ]


def build_run_metadata(
    config: ProcessorConfig,
    datasets: dict[str, str],
    aoi_metadata: dict[str, Any],
    exports: list[dict[str, Any]],
    task_statuses: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "runTimestamp": config.run_timestamp,
        "scoreVersion": config.score_version,
        "config": config.to_metadata(),
        "datasetsUsed": datasets,
        "aoi": aoi_metadata,
        "dateRange": {"startDate": config.start_date, "endDate": config.end_date},
        "exports": [
            {
                "name": item["name"],
                "kind": item["kind"],
                "uri": item["uri"],
                "taskId": _task_id(item.get("task")),
            }
            for item in exports
        ],
        "taskStatuses": task_statuses or [],
        "futureBridgeTodo": "Google Cloud Storage export output -> sync/copy to AWS S3 processed-data bucket -> API reads scored outputs from S3.",
    }


def write_metadata(metadata: dict[str, Any], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metadata, ensure_ascii=True, indent=2), encoding="utf-8")
    return output_path


def _task_id(task) -> str | None:
    if task is None:
        return None
    try:
        return task.status().get("id")
    except Exception:
        return getattr(task, "id", None)
