"""Build fixtures/materials.json for the mock materials API from the CC0 data bundled with the Lightsmith library.

Needs the Python library (it ships the CC0 tables):
    uv run --project ../PlasmonHub --with pyyaml python scripts/build_material_fixtures.py [DATA_DIR]
The output mimics the materials service's /v1 responses (see src/lib/materials/types.ts).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

def library_data_dir() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    try:
        import lightsmith
    except ImportError:
        raise SystemExit("install the library (lightsmith) or pass the materials data directory as an argument")
    return Path(lightsmith.__file__).parent / "data" / "materials"


DATA = library_data_dir()
OUT = Path(__file__).resolve().parents[1] / "fixtures" / "materials.json"

# Category IDs of the materials service (0.2).
CATEGORIES = {"Au": "metal", "Ag": "metal", "Al": "metal", "Cu": "metal",
              "Si": "semiconductor", "TiO2": "glass_oxide", "SiO2": "glass_oxide", "H2O": "liquid"}
MAX_POINTS = 220


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_authors_year(reference: str) -> tuple[str, int | None]:
    # "P. B. Johnson and R. W. Christy. Title. Journal (1972)": keep joining ". "-separated
    # pieces while the current one ends in an initial.
    parts = re.sub(r"^\d+\)\s*", "", reference).split(". ")
    authors, i = parts[0], 0
    while i + 1 < len(parts) and re.search(r"(^|[\s\-])[A-Z][a-z]?$", parts[i]):
        i += 1
        authors += ". " + parts[i]
    authors = authors.strip().rstrip(".")
    years = re.findall(r"\((\d{4})\)", reference) or re.findall(r"\b(19\d{2}|20\d{2})\b", reference)
    return authors, int(years[-1]) if years else None


def thin(rows: list[list[float]]) -> list[list[float]]:
    if len(rows) <= MAX_POINTS:
        return rows
    step = len(rows) / MAX_POINTS
    picked = [rows[int(i * step)] for i in range(MAX_POINTS)]
    if picked[-1] is not rows[-1]:
        picked.append(rows[-1])
    return picked


def read_tabulated(path: Path) -> list[list[float]] | None:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    for block in doc.get("DATA", []):
        if block.get("type") == "tabulated nk":
            rows = []
            for line in block["data"].strip().splitlines():
                parts = [float(x) for x in line.split()]
                if len(parts) >= 3:
                    rows.append([round(parts[0] * 1000, 4), parts[1], parts[2]])
            return thin(rows)
    return None


def main() -> None:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    materials, datasets = [], {}
    for mat_id, mat in manifest["materials"].items():
        summaries = []
        for ds_name, ds in mat["datasets"].items():
            rows = read_tabulated(DATA / ds["file"])
            if rows is None:  # formula datasets are not mocked
                continue
            authors, year = parse_authors_year(ds.get("reference", ""))
            ds_id = f"{slug(mat_id)}-{slug(ds_name)}"
            summary = {
                "id": ds_id,
                "material_id": mat_id,
                "name": ds_name,
                "authors": authors,
                "year": year,
                "reference": ds.get("reference", ""),
                "doi": ds.get("doi"),
                "license": manifest.get("license", "CC0-1.0"),
                "comments": ds.get("comments", ""),
                "type": "tabulated nk",
                "range_nm": [rows[0][0], rows[-1][0]],
                "has_k": ds.get("has_k", True),
                "is_default": ds_name == mat.get("default"),
                "source_url": ds.get("source_url"),
            }
            summaries.append(summary)
            datasets[ds_id] = {"dataset": summary, "data": {
                "wavelength_nm": [r[0] for r in rows], "n": [r[1] for r in rows], "k": [r[2] for r in rows]}}
        if summaries:
            materials.append({"id": mat_id, "name": mat.get("description", mat_id), "formula": mat_id,
                              "category": CATEGORIES.get(mat_id, "other"), "aliases": mat.get("aliases", []),
                              "description": mat.get("description", ""), "datasets": summaries})
    OUT.write_text(json.dumps({"generated_from": manifest.get("database_citation"), "materials": materials,
                               "datasets": datasets}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({len(materials)} materials, {len(datasets)} datasets)")


if __name__ == "__main__":
    main()
