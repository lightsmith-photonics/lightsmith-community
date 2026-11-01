"""Build fixtures/demo/: one example problem per kind and the result the library computes for it.

Used by the seed script and as test data for the result viewers. Needs the Python library:
    uv run --project ../lightsmith python scripts/build_demo_results.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import lightsmith as lib

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "demo"

SI = {"kind": "constant_index", "n_real": 3.48}
SIO2 = {"kind": "constant_index", "n_real": 1.444}
AIR = {"kind": "constant_index", "n_real": 1.0}
TIO2 = {"kind": "constant_index", "n_real": 2.4}
MGF2 = {"kind": "constant_index", "n_real": 1.38}
GLASS = {"kind": "constant_index", "n_real": 1.52}

PROBLEMS: dict[str, dict] = {
    "layer_stack": {
        "kind": "layer_stack",
        "superstrate": AIR,
        "layers": [{"thickness_nm": 100.0, "material": MGF2}],
        "substrate": GLASS,
        "wavelengths": {"start_nm": 400, "stop_nm": 800, "num": 81},
        "angles_deg": [0.0, 45.0],
        "polarizations": ["s", "p"],
    },
    "bragg": {
        "kind": "layer_stack",
        "superstrate": AIR,
        "layers": [{"thickness_nm": t, "material": m} for _ in range(8) for t, m in ((64.6, TIO2), (112.3, MGF2))],
        "substrate": GLASS,
        "wavelengths": {"start_nm": 450, "stop_nm": 700, "num": 126},
        "angles_deg": [0.0],
        "polarizations": ["s"],
    },
    "periodic": {
        "kind": "periodic",
        "lattice_a1_nm": [400.0, 0.0],
        "lattice_a2_nm": None,
        "superstrate": AIR,
        "layers": [{"thickness_nm": 150.0, "background": AIR,
                    "shapes": [{"profile": {"kind": "rectangle", "size_nm": [200.0, 1.0]}, "material": TIO2}]}],
        "substrate": GLASS,
        "wavelengths": {"start_nm": 450, "stop_nm": 750, "num": 61},
        "incidence": {"theta_deg": 0.0, "phi_deg": 0.0, "polarizations": ["s", "p"]},
        "options": {"rcwa": {"harmonics": 15}},
    },
    "mode": {
        "kind": "mode",
        "structures": [
            {"name": "core", "profile": {"kind": "rectangle", "size_nm": [500.0, 220.0]}, "material": SI},
        ],
        "background": SIO2,
        "window_size_nm": [2000.0, 1500.0],
        "wavelengths": [1500.0, 1550.0, 1600.0],
        "num_modes": 2,
        "include_fields": True,
        "options": {"fde": {"grid_spacing_nm": 25}},
    },
    "bands": {
        "kind": "bands",
        "dimension": 2,
        "lattice_vectors_nm": [[400.0, 0.0, 0.0], [0.0, 400.0, 0.0]],
        "background": AIR,
        "structures_2d": [{"profile": {"kind": "circle", "radius_nm": 80.0}, "material": {"kind": "constant_permittivity", "eps_real": 8.9}}],
        "k_path": [{"label": "Γ", "reduced": [0, 0, 0]}, {"label": "X", "reduced": [0.5, 0, 0]},
                   {"label": "M", "reduced": [0.5, 0.5, 0]}, {"label": "Γ", "reduced": [0, 0, 0]}],
        "points_per_segment": 12,
        "num_bands": 6,
        "polarization": "both",
    },
    "circuit": {
        "kind": "circuit",
        "instances": {
            "split": {"component": "coupler", "settings": {"coupling": 0.5}},
            "combine": {"component": "coupler", "settings": {"coupling": 0.5}},
            "long": {"component": "waveguide", "settings": {"length_nm": 120000.0, "neff": 2.4, "ng": 4.2, "wl0_nm": 1550.0, "loss_db_per_cm": 2.0}},
            "short": {"component": "waveguide", "settings": {"length_nm": 100000.0, "neff": 2.4, "ng": 4.2, "wl0_nm": 1550.0, "loss_db_per_cm": 2.0}},
            "dump": {"component": "terminator"},
        },
        "connections": [["split,o3", "long,o1"], ["long,o2", "combine,o2"], ["split,o4", "short,o1"],
                        ["short,o2", "combine,o1"], ["split,o2", "dump,o1"]],
        "ports": {"in": "split,o1", "bar": "combine,o4", "cross": "combine,o3"},
        "wavelengths": {"start_nm": 1530, "stop_nm": 1570, "num": 401},
    },
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for name, problem in PROBLEMS.items():
        if only and name not in only:
            continue
        t0 = time.perf_counter()
        try:
            res = lib.solve(problem, device="cpu")
        except Exception as err:  # keep going; report which demos could not be built
            print(f"{name}: FAILED {type(err).__name__}: {err}")
            continue
        (OUT / f"{name}.spec.json").write_text(json.dumps(problem, indent=2, ensure_ascii=False), encoding="utf-8")
        text = res.model_dump_json() if hasattr(res, "model_dump_json") else json.dumps(res)
        (OUT / f"{name}.result.json").write_text(text, encoding="utf-8")
        print(f"{name}: {getattr(res, 'kind', '?')} via {res.backend} in {time.perf_counter() - t0:.1f} s, {len(text) // 1024} KiB")


if __name__ == "__main__":
    main()
