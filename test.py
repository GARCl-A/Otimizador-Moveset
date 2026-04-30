import json
import os

from loader import carregar_meta, carregar_time
from optimizer import otimizar, otimizar_time_sa, construir_caches
from reporter import gerar_relatorio

FONTES = "Level, Egg"
TAMANHO_TIME = 6
BUDGET = 1000

# Hiperparâmetros do SA
SA_TEMPERATURA = 200.0
SA_COOLING = 0.9995
SA_ITERACOES = 10000

WHITELIST = [
    # "Vikavolt",
    # "Golisopod",
    # "Volcarona",
    "Ariados",
    "Kricketune",
]
BANLIST = ["Rayquaza", "Eternatus", "Tapu Fini"]
TYPE_FILTER = ["Bug"]  # só Pokémons com esse(s) tipo(s) — vazio = sem filtro


def carregar_custos():
    caminho = os.path.join("results", "additional_info", "cost.json")
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    custos = carregar_custos()

    print("=== Carregando meta ===")
    meta_inimigos = carregar_meta(fontes=FONTES)
    score_maximo = len(meta_inimigos) * 100.0

    print("\n=== Carregando candidatos ===")
    if WHITELIST:
        candidatos = carregar_time(WHITELIST, fontes=FONTES)
    else:
        from meta import META

        nomes_candidatos = [
            nome
            for _, nome, t1, t2 in META
            if nome not in BANLIST
            and (not TYPE_FILTER or t1 in TYPE_FILTER or t2 in TYPE_FILTER)
        ]
        candidatos = carregar_time(nomes_candidatos, fontes=FONTES)

    # Filtra candidatos que nem individualmente cabem no budget
    candidatos = [p for p in candidatos if custos.get(p.name, 999) <= BUDGET]

    print("\n=== Otimizando movesets individuais ===")
    cache_dano, cache_bulk, arrays = construir_caches(candidatos, meta_inimigos)
    scores_individuais = {}
    for pokemon in candidatos:
        moveset, score_individual = otimizar(
            pokemon,
            meta_inimigos,
            cache_bulk=cache_bulk,
            cache_dano=cache_dano,
            arrays=arrays,
        )
        scores_individuais[pokemon.name] = (list(moveset), score_individual)
        print(
            f"  {pokemon.name:<15} custo: {custos.get(pokemon.name, '?'):>2}  score: {score_individual:.2f}"
        )

    time_atual = []
    movesets_atual = []
    score_atual = 0.0
    budget_restante = BUDGET

    for rodada in range(TAMANHO_TIME):
        print(f"\n=== Rodada {rodada + 1} ===")
        melhor_pokemon = None
        melhor_movesets = None

        candidatos_validos = [
            p
            for p in candidatos
            if p not in time_atual and custos.get(p.name, 999) <= budget_restante
        ]

        if not candidatos_validos:
            print(
                f"Sem candidatos válidos no budget restante ({budget_restante}pt). Encerrando."
            )
            break

        for poke in candidatos_validos:
            if rodada == 0:
                moveset_ws, score_teste = scores_individuais[poke.name]
                movesets_teste = [moveset_ws]
            else:
                print(f"  Testando {poke.name}...")
                time_teste = time_atual + [poke]
                movesets_teste, score_teste = otimizar_time_sa(
                    time_teste,
                    meta_inimigos,
                    max_iteracoes=SA_ITERACOES,
                    temperatura_inicial=SA_TEMPERATURA,
                    cooling_rate=SA_COOLING,
                    warm_start=scores_individuais,
                )

            if score_teste > score_atual:
                melhor_pokemon = poke
                melhor_movesets = movesets_teste
                score_atual = score_teste

        if melhor_pokemon is None:
            print(
                f"Nenhum candidato melhora o time com {len(time_atual)} membros. Encerrando."
            )
            break

        custo_escolhido = custos.get(melhor_pokemon.name, 0)
        budget_restante -= custo_escolhido
        time_atual.append(melhor_pokemon)
        movesets_atual = list(melhor_movesets)

        print(
            f"-> {melhor_pokemon.name} escolhido (custo {custo_escolhido}, budget restante: {budget_restante}) score: {score_atual:.2f} / {score_maximo:.0f}"
        )

        if score_atual >= score_maximo:
            print("Score máximo atingido, encerrando.")
            break

    custo_total = sum(custos.get(p.name, 0) for p in time_atual)

    print("\n=== Time Final ===")
    print(
        f"Score: {score_atual:.2f} / {score_maximo:.0f}  |  Custo total: {custo_total} / {BUDGET}"
    )
    for pokemon, moveset in zip(time_atual, movesets_atual):
        print(f"\n{pokemon.name} (custo {custos.get(pokemon.name, '?')}):")
        for move in moveset:
            print(f"  -> {move.name} ({move.type} - {move.category})")

    gerar_relatorio(
        time_atual, movesets_atual, meta_inimigos, fontes=FONTES, score=score_atual
    )
