from __future__ import annotations

import time
from typing import Any


RUNNING_STATES = {"READY", "RUNNING"}
TERMINAL_STATES = {"COMPLETED", "FAILED", "CANCELLED"}


def start_task(task):
    task.start()
    return task


def wait_for_task(task_or_id, poll_seconds: int = 30, timeout: int | None = None) -> dict[str, Any]:
    task = _resolve_task(task_or_id)
    started = time.time()
    while True:
        status = task.status()
        if status.get("state") in TERMINAL_STATES:
            return status
        if timeout is not None and time.time() - started > timeout:
            raise TimeoutError(f"Timed out waiting for Earth Engine task {status.get('id')}")
        time.sleep(poll_seconds)


def list_running_tasks() -> list[dict[str, Any]]:
    import ee

    return [task.status() for task in ee.batch.Task.list() if task.status().get("state") in RUNNING_STATES]


def enforce_max_concurrent_tasks(max_concurrent: int) -> None:
    running = list_running_tasks()
    if len(running) >= max_concurrent:
        raise RuntimeError(f"Earth Engine has {len(running)} running/ready tasks; limit is {max_concurrent}.")


def summarize_task_statuses() -> list[dict[str, Any]]:
    import ee

    return [task.status() for task in ee.batch.Task.list()]


def _resolve_task(task_or_id):
    import ee

    if hasattr(task_or_id, "status"):
        return task_or_id
    task_id = str(task_or_id)
    for task in ee.batch.Task.list():
        if task.status().get("id") == task_id:
            return task
    raise ValueError(f"Earth Engine task not found: {task_id}")
