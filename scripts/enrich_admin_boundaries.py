#!/usr/bin/env python3
"""Enrich candidate-area GeoJSON with Ethiopia admin boundary names.

The active Earth Engine export produces grid cells plus indicators. This script
adds human-readable administrative context by joining each candidate feature's
centroid to an Admin 3 boundary FeatureCollection.

Default admin source is the public ICPAC GeoServer mirror of the Ethiopia
Admin 3 boundary data. For offline or audited runs, download the admin
GeoJSON first and pass --admin-boundaries.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ADMIN_URL = (
    "https://geoportal.icpac.net/geoserver/ows"
    "?service=WFS&version=1.0.0&request=GetFeature"
    "&typename=geonode%3Aeth_adm3"
    "&outputFormat=json&srs=EPSG%3A4326&srsName=EPSG%3A4326"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Join candidate areas to Ethiopia Admin 3 boundaries.")
    parser.add_argument("--areas-input", required=True, type=Path, help="Input areas.geojson or final_gis_data.geojson.")
    parser.add_argument("--areas-output", required=True, type=Path, help="Output enriched GeoJSON path.")
    parser.add_argument("--admin-boundaries", type=Path, help="Local admin boundary GeoJSON path.")
    parser.add_argument("--admin-url", default=DEFAULT_ADMIN_URL, help="Admin boundary GeoJSON URL used when no local file is supplied.")
    parser.add_argument("--admin-cache", type=Path, help="Optional cache path for downloaded admin boundaries.")
    parser.add_argument("--strict", action="store_true", help="Fail if any feature cannot be matched to an admin boundary.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    areas = read_geojson(args.areas_input)
    admin = load_admin_boundaries(args)
    enriched, matched, unmatched = enrich_areas(areas, admin)
    if args.strict and unmatched:
        raise SystemExit(f"{unmatched} features did not match an admin boundary.")
    write_json(args.areas_output, enriched)
    print(
        json.dumps(
            {
                "status": "ok",
                "features": len(enriched.get("features", [])),
                "adminFeatures": len(admin.get("features", [])),
                "matched": matched,
                "unmatched": unmatched,
                "output": str(args.areas_output),
            },
            ensure_ascii=True,
        )
    )
    return 0


def load_admin_boundaries(args: argparse.Namespace) -> dict[str, Any]:
    if args.admin_boundaries:
        return read_geojson(args.admin_boundaries)
    if args.admin_cache and args.admin_cache.exists():
        return read_geojson(args.admin_cache)

    with urllib.request.urlopen(args.admin_url, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    validate_feature_collection(payload, "admin boundary source")
    if args.admin_cache:
        write_json(args.admin_cache, payload)
    return payload


def read_geojson(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    validate_feature_collection(payload, str(path))
    return payload


def validate_feature_collection(payload: Any, label: str) -> None:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError(f"{label} must be a GeoJSON FeatureCollection.")


def enrich_areas(areas: dict[str, Any], admin: dict[str, Any]) -> tuple[dict[str, Any], int, int]:
    admin_index = build_admin_index(admin)
    enriched_features: list[dict[str, Any]] = []
    matched = 0
    unmatched = 0

    for index, feature in enumerate(areas.get("features", []), start=1):
        if not isinstance(feature, dict):
            continue
        properties = dict(feature.get("properties") or {})
        centroid = geometry_centroid(feature.get("geometry"))
        admin_properties = find_admin_properties(centroid, admin_index) if centroid else None

        if admin_properties:
            matched += 1
            properties = merge_admin_properties(properties, admin_properties, index)
        else:
            unmatched += 1
            properties = ensure_display_identity(properties, index)

        enriched_features.append({**feature, "properties": properties})

    return {**areas, "features": enriched_features}, matched, unmatched


def build_admin_index(admin: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for feature in admin.get("features", []):
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue
        bbox = geometry_bbox(geometry)
        if not bbox:
            continue
        entries.append(
            {
                "bbox": bbox,
                "geometry": geometry,
                "properties": feature.get("properties") or {},
            }
        )
    return entries


def find_admin_properties(point: tuple[float, float], admin_index: list[dict[str, Any]]) -> dict[str, Any] | None:
    lng, lat = point
    for entry in admin_index:
        min_lng, min_lat, max_lng, max_lat = entry["bbox"]
        if lng < min_lng or lng > max_lng or lat < min_lat or lat > max_lat:
            continue
        if point_in_geometry(point, entry["geometry"]):
            return entry["properties"]
    return None


def merge_admin_properties(properties: dict[str, Any], admin: dict[str, Any], index: int) -> dict[str, Any]:
    region = text(admin.get("NAME_1") or admin.get("ADM1_EN") or admin.get("admin1Name") or admin.get("regionName"))
    zone = text(admin.get("NAME_2") or admin.get("ADM2_EN") or admin.get("admin2Name") or admin.get("zoneName"))
    woreda = text(admin.get("NAME_3") or admin.get("ADM3_EN") or admin.get("admin3Name") or admin.get("woredaName"))
    candidate = text(properties.get("candidateLabel") or properties.get("candidate_label")) or f"Candidate Area {index:02d}"
    technical = text(properties.get("technicalName") or properties.get("technical_name"))
    if not technical and properties.get("grid_id") is not None:
        technical = f"Grid cell {properties['grid_id']}"
    if not technical:
        technical = text(properties.get("areaId") or properties.get("area_id") or properties.get("id"))

    display_parts = [part for part in (region, zone, candidate) if part]
    display_name = " · ".join(display_parts) if display_parts else candidate

    result = dict(properties)
    area_id = stable_area_id(result)
    if area_id:
        result["areaId"] = area_id
    if region:
        result["regionName"] = region
        result["region"] = region
    if zone:
        result["zoneName"] = zone
    if woreda:
        result["woredaName"] = woreda
    result["adminLevel"] = "admin3" if woreda else "admin2" if zone else "admin1" if region else result.get("adminLevel")
    result["adminSource"] = "ICPAC Ethiopia Admin 3 via GeoServer"
    result["admin1Code"] = text(admin.get("ID_1") or admin.get("ADM1_PCODE"))
    result["admin2Code"] = text(admin.get("ID_2") or admin.get("ADM2_PCODE"))
    result["admin3Code"] = text(admin.get("CCA_3") or admin.get("ID_3") or admin.get("ADM3_PCODE"))
    result["candidateLabel"] = candidate
    result["technicalName"] = technical
    result["displayName"] = display_name
    result["name"] = display_name
    return result


def ensure_display_identity(properties: dict[str, Any], index: int) -> dict[str, Any]:
    result = dict(properties)
    area_id = stable_area_id(result)
    if area_id:
        result["areaId"] = area_id
    candidate = text(result.get("candidateLabel") or result.get("candidate_label")) or f"Candidate Area {index:02d}"
    technical = text(result.get("technicalName") or result.get("technical_name"))
    if not technical and result.get("grid_id") is not None:
        technical = f"Grid cell {result['grid_id']}"
    region = text(result.get("regionName") or result.get("region"))
    display_parts = [part for part in (region, candidate) if part and part.lower() not in {"ethiopia", "et"}]
    result["candidateLabel"] = candidate
    if technical:
        result["technicalName"] = technical
    if not text(result.get("displayName")):
        result["displayName"] = " · ".join(display_parts) if display_parts else candidate
    result["name"] = result["displayName"]
    return result


def stable_area_id(properties: dict[str, Any]) -> str | None:
    for key in ("areaId", "area_id", "id"):
        value = text(properties.get(key))
        if value:
            return value
    if properties.get("grid_id") is not None:
        return f"ET-GRID-{properties['grid_id']}"
    return None


def geometry_centroid(geometry: Any) -> tuple[float, float] | None:
    points = list(iter_points(geometry))
    if not points:
        return None
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def geometry_bbox(geometry: dict[str, Any]) -> tuple[float, float, float, float] | None:
    points = list(iter_points(geometry))
    if not points:
        return None
    lngs = [point[0] for point in points]
    lats = [point[1] for point in points]
    return min(lngs), min(lats), max(lngs), max(lats)


def iter_points(geometry: Any):
    if not isinstance(geometry, dict):
        return
    coordinates = geometry.get("coordinates")
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        for ring in coordinates or []:
            for point in ring or []:
                if is_point(point):
                    yield float(point[0]), float(point[1])
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates or []:
            for ring in polygon or []:
                for point in ring or []:
                    if is_point(point):
                        yield float(point[0]), float(point[1])


def point_in_geometry(point: tuple[float, float], geometry: dict[str, Any]) -> bool:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if geometry_type == "Polygon":
        return point_in_polygon(point, coordinates)
    if geometry_type == "MultiPolygon":
        return any(point_in_polygon(point, polygon) for polygon in coordinates)
    return False


def point_in_polygon(point: tuple[float, float], polygon: list[Any]) -> bool:
    if not polygon:
        return False
    exterior = polygon[0]
    if not point_in_ring(point, exterior):
        return False
    holes = polygon[1:]
    return not any(point_in_ring(point, hole) for hole in holes)


def point_in_ring(point: tuple[float, float], ring: list[Any]) -> bool:
    x, y = point
    inside = False
    if len(ring) < 3:
        return False
    j = len(ring) - 1
    for i, current in enumerate(ring):
        previous = ring[j]
        if not is_point(current) or not is_point(previous):
            j = i
            continue
        xi, yi = float(current[0]), float(current[1])
        xj, yj = float(previous[0]), float(previous[1])
        intersects = (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi) / ((yj - yi) or sys.float_info.epsilon) + xi)
        if intersects:
            inside = not inside
        j = i
    return inside


def is_point(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float))


def text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
