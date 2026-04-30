import json
from pathlib import Path

with open(Path(__file__).parent / "TypeChartFull.json", encoding="utf-8") as f:
    type_chart: dict[str, dict[str, float]] = json.load(f)


def get_type_multiplier(atk_type: str, def_type_1: str, def_type_2: str = None) -> float:
    atk = type_chart.get(atk_type)
    if atk is None:
        return 1.0
    if def_type_2 and def_type_1 != def_type_2:
        return atk.get(f"{def_type_1}/{def_type_2}", 1.0)
    return atk.get(def_type_1, 1.0)
