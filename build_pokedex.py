"""
Gera typescript/pokedex.json a partir dos CSVs e JSONs já scrapeados em results/.
"""
import json
import os

import pandas as pd

from meta import META

DIR_MOVESETS = os.path.join("results", "movesets")
DIR_STATS = os.path.join("results", "stats")
DIR_ADDITIONAL = os.path.join("results", "additional_info")


def build():
    with open(os.path.join(DIR_ADDITIONAL, "cost.json"), encoding="utf-8") as f:
        custos = json.load(f)

    pokedex = {}

    for numero, nome, type1, type2 in META:
        csv_path = os.path.join(DIR_MOVESETS, f"pokemon_{numero}_moveset.csv")
        stats_path = os.path.join(DIR_STATS, f"pokemon_{numero}_moveset_stats.json")

        if not os.path.exists(csv_path) or not os.path.exists(stats_path):
            print(f"  [SKIP] {nome} — arquivos não encontrados")
            continue

        df = pd.read_csv(csv_path)
        with open(stats_path, encoding="utf-8") as f:
            stats = json.load(f)

        moves = []
        for _, row in df.iterrows():
            moves.append({
                "name":     row["Name"],
                "type":     row["Type"],
                "category": row["Category"],
                "power":    int(row["Power"]) if str(row["Power"]) not in ("—", "nan") else 0,
                "accuracy": int(row["Accuracy"]) if str(row["Accuracy"]) not in ("—", "nan") else 0,
                "source":   row["Source"],
            })

        pokedex[nome] = {
            "number": numero,
            "type1":  type1,
            "type2":  type2,
            "cost":   custos.get(nome, 0),
            "stats":  stats,
            "moves":  moves,
        }

        print(f"  [OK] {nome} — {len(moves)} moves")

    os.makedirs("typescript", exist_ok=True)
    out_path = os.path.join("typescript", "pokedex.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pokedex, f, ensure_ascii=False, indent=2)

    print(f"\npokedex.json gerado com {len(pokedex)} Pokemons -> {out_path}")


if __name__ == "__main__":
    build()
