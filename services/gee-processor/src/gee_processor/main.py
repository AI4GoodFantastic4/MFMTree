from __future__ import annotations

import json
import sys

from .aoi import aoi_metadata, load_aoi
from .auth import initialize_earth_engine
from .config import parse_args, validate_config
from .datasets import dataset_metadata
from .exports import build_export_tasks, build_run_metadata, dry_run_export_plan, write_metadata
from .indices import build_indicator_inputs
from .preprocessing import make_grid
from .scoring import build_score_stack, reduce_grid_scores
from .tasks import enforce_max_concurrent_tasks, start_task, summarize_task_statuses


def main(argv: list[str] | None = None) -> int:
    config = parse_args(argv)
    warnings = validate_config(config)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    if warnings and not config.dry_run:
        return 2

    print("Initializing Earth Engine...")
    initialize_earth_engine(config)

    print("Building AOI and Earth Engine computation graph...")
    aoi_fc, aoi = load_aoi(config)
    indicators = build_indicator_inputs(aoi, config)
    score_stack = build_score_stack(indicators)
    grid = make_grid(aoi, config.grid_size_m)
    grid_scores = reduce_grid_scores(score_stack, grid, config.export_scale, indicators["projection"])

    if config.dry_run:
        export_plan = dry_run_export_plan(config)
        metadata = build_run_metadata(config, dataset_metadata(), aoi_metadata(config), export_plan)
        print("Dry run: no export tasks were started.")
        print(json.dumps(metadata, ensure_ascii=True, indent=2))
        write_metadata(metadata, "/tmp/gee_processor_metadata.json")
        return 0

    enforce_max_concurrent_tasks(config.max_concurrent_tasks)
    export_tasks = build_export_tasks(config, aoi, grid_scores, score_stack)
    started = []
    for item in export_tasks:
        enforce_max_concurrent_tasks(config.max_concurrent_tasks)
        task = start_task(item["task"])
        started.append({**item, "task": task})
        print(f"Started {item['name']}: {task.status().get('id')}")

    metadata = build_run_metadata(config, dataset_metadata(), aoi_metadata(config), started, summarize_task_statuses())
    metadata_path = write_metadata(metadata, "/tmp/gee_processor_metadata.json")
    print(f"Wrote metadata to {metadata_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
