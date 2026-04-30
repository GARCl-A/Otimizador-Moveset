import itertools
import json
import math
import os
import random

import numpy as np

from profiler import cronometrar


def _carregar_prioridades():
    caminho = os.path.join(os.path.dirname(__file__), "priority.json")
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


PRIORIDADES = _carregar_prioridades()


@cronometrar
def otimizar(pokemon_atacante, lista_inimigos, cache_bulk=None, cache_dano=None, arrays=None):
    """
    Testa todas as combinacoes de 4 golpes e retorna a melhor.
    Se arrays fornecido, usa score vetorizado. Caso contrario, fallback para dicts.
    """
    pokemon_atacante.optimize_moveset()

    melhor_score_global = 0
    melhor_moveset = None

    combinacoes = list(
        itertools.combinations(
            pokemon_atacante.moveset, min(4, len(pokemon_atacante.moveset))
        )
    )
    print(
        f"[{pokemon_atacante.name}] Testando {len(combinacoes)} combinacoes de movesets..."
    )

    if arrays is not None:
        # Usa score vetorizado: monta time de 1 pokemon com indices de moves
        idx_poke = arrays["poke_idx"].get(pokemon_atacante.name)
        if idx_poke is not None:
            move_idx_map = arrays["move_idx"][idx_poke]  # move.name -> idx local
            for moveset in combinacoes:
                indices = [move_idx_map[m.name] for m in moveset if m.name in move_idx_map]
                if not indices:
                    continue
                estado = [indices]
                score = calcular_score_time_np([idx_poke], estado, arrays)
                if score > melhor_score_global:
                    melhor_score_global = score
                    melhor_moveset = moveset
            return melhor_moveset, melhor_score_global

    # Fallback: dicts
    for moveset in combinacoes:
        score_moveset_atual = 0.0
        for inimigo in lista_inimigos:
            melhor_ev_nesta_luta = 0.0
            for move in moveset:
                ev = calcular_score_combate(pokemon_atacante, inimigo, move, cache_bulk, cache_dano)
                melhor_ev_nesta_luta = max(melhor_ev_nesta_luta, ev)
            score_moveset_atual += melhor_ev_nesta_luta
        if score_moveset_atual > melhor_score_global:
            melhor_score_global = score_moveset_atual
            melhor_moveset = moveset

    return melhor_moveset, melhor_score_global



@cronometrar
def construir_caches(time, meta):
    """
    Pre-calcula caches estaticos para o SA:
    - cache_dano:  (poke.name, move.name, inimigo.name) -> float  [fallback dict]
    - cache_bulk:  (inimigo.name, poke.name)            -> float  [fallback dict]
    - arrays: estrutura NumPy para score vetorizado:
        dano_array[i_poke, i_move_local, i_inimigo]  shape: (P, M_max, I)
        bulk_array[i_inimigo, i_poke]                shape: (I, P)
        speed_poke[i_poke]                           shape: (P,)
        speed_inimigo[i_inimigo]                     shape: (I,)
        poke_idx:   {poke.name -> i_poke}
        move_idx:   [{move.name -> i_move_local}, ...]  por poke
        move_lists: [[Move, ...], ...]  por poke (ordem dos indices)
    """
    P = len(time)
    I = len(meta)
    M_max = max(len(p.moveset) for p in time) if time else 1

    poke_idx = {p.name: i for i, p in enumerate(time)}

    # move_idx[i_poke] = {move.name -> i_move_local}
    move_idx = [{m.name: j for j, m in enumerate(p.moveset)} for p in time]
    move_lists = [list(p.moveset) for p in time]

    # dano_array[i_poke, i_move_local, i_inimigo]
    dano_array = np.zeros((P, M_max, I), dtype=np.float32)
    for i, poke in enumerate(time):
        for j, move in enumerate(poke.moveset):
            for k, inimigo in enumerate(meta):
                dano_array[i, j, k] = poke.calcular_dano_esperado(move, inimigo)

    speed_poke    = np.array([p.speed    for p in time],  dtype=np.float32)
    speed_inimigo = np.array([e.speed    for e in meta],  dtype=np.float32)

    # prio_move[i_poke, i_move_local]: prioridade de cada move do time
    prio_move = np.zeros((P, M_max), dtype=np.int32)
    for i, poke in enumerate(time):
        for j, move in enumerate(poke.moveset):
            prio_move[i, j] = PRIORIDADES.get(move.name, 0)

    # bulk_contextual[i_poke, i_move_local, i_inimigo]:
    # maior dano que o inimigo causa no poke com moves que agem ANTES do move do poke
    bulk_contextual = np.zeros((P, M_max, I), dtype=np.float32)
    for k, inimigo in enumerate(meta):
        # dano de cada move do inimigo contra cada poke do time
        danos_inimigo = np.array(
            [[inimigo.calcular_dano_esperado(m, poke) for poke in time] for m in inimigo.moveset],
            dtype=np.float32,
        )  # (M_ini, P)
        prios_inimigo = np.array(
            [PRIORIDADES.get(m.name, 0) for m in inimigo.moveset], dtype=np.int32
        )  # (M_ini,)
        for i in range(P):
            for j in range(len(time[i].moveset)):
                prio_meu_move = prio_move[i, j]
                speed_p = speed_poke[i]
                speed_i = speed_inimigo[k]
                # move do inimigo age antes se: prio_ini > prio_meu, ou empate e inimigo mais rapido
                age_antes = np.where(
                    prios_inimigo > prio_meu_move, True,
                    np.where(prio_meu_move > prios_inimigo, False, speed_i >= speed_p)
                )  # (M_ini,)
                danos_validos = danos_inimigo[age_antes, i]  # moves que agem antes, dano no poke i
                bulk_contextual[i, j, k] = danos_validos.max() if len(danos_validos) > 0 else 0.0

    # inimigo_mata[i_poke, i_move, i_inimigo]: True se inimigo consegue matar antes do move
    mascara_morto = bulk_contextual >= 100.0  # (P, M, I)

    # dano_efetivo[i_poke, i_move_local, i_inimigo]: dano real apos speed/bulk check
    dano_efetivo = np.where(mascara_morto, 0.0, dano_array)  # (P, M, I)

    arrays = {
        "dano_efetivo": dano_efetivo,   # (P, M_max, I)
        "poke_idx":     poke_idx,
        "move_idx":     move_idx,
        "move_lists":   move_lists,
        "M_max":        M_max,
        "P":            P,
        "I":            I,
    }

    # Fallback dicts (usados fora do SA e no reporter)
    cache_dano = {}
    for i, poke in enumerate(time):
        for j, move in enumerate(poke.moveset):
            for k, inimigo in enumerate(meta):
                cache_dano[(poke.name, move.name, inimigo.name)] = float(dano_array[i, j, k])

    # cache_bulk_contextual: (inimigo.name, poke.name, move_do_poke.name) -> maior dano do inimigo que age antes
    cache_bulk = {}
    for i, poke in enumerate(time):
        for j, move in enumerate(poke.moveset):
            for k, inimigo in enumerate(meta):
                cache_bulk[(inimigo.name, poke.name, move.name)] = float(bulk_contextual[i, j, k])

    return cache_dano, cache_bulk, arrays


@cronometrar
def calcular_score_combate(meu_poke, inimigo, meu_ataque, cache_bulk=None, cache_dano=None):
    """
    Retorna o % de dano de meu_ataque contra inimigo, aplicando Speed e Bulk Check.
    cache_dano: dict (poke.name, move.name, inimigo.name) -> dano, elimina calcular_dano_esperado.
    cache_bulk: dict (inimigo.name, poke.name) -> maior_dano_inimigo.
    """
    if cache_dano is not None:
        dano_meu = cache_dano[(meu_poke.name, meu_ataque.name, inimigo.name)]
    else:
        dano_meu = meu_poke.calcular_dano_esperado(meu_ataque, inimigo)

    prio_meu    = PRIORIDADES.get(meu_ataque.name, 0)
    prio_inimigo = max((PRIORIDADES.get(m.name, 0) for m in inimigo.moveset), default=0)

    if prio_meu > prio_inimigo:
        return dano_meu
    elif prio_inimigo > prio_meu:
        inimigo_age_primeiro = True
    else:
        inimigo_age_primeiro = inimigo.speed >= meu_poke.speed

    if not inimigo_age_primeiro:
        return dano_meu

    if cache_bulk is not None:
        maior_dano_inimigo = cache_bulk[(inimigo.name, meu_poke.name, meu_ataque.name)]
    else:
        prio_meu_move = PRIORIDADES.get(meu_ataque.name, 0)
        maior_dano_inimigo = max(
            (
                inimigo.calcular_dano_esperado(m, meu_poke)
                for m in inimigo.moveset
                if (
                    PRIORIDADES.get(m.name, 0) > prio_meu_move
                    or (PRIORIDADES.get(m.name, 0) == prio_meu_move and inimigo.speed >= meu_poke.speed)
                )
            ),
            default=0.0,
        )

    return 0.0 if maior_dano_inimigo >= 100.0 else dano_meu


def calcular_score_time_np(poke_indices, estado_indices, arrays):
    """
    Versao vetorizada de calcular_score_time usando NumPy.
    Monta um unico array (total_moves_ativos, I) e faz um np.max global.
    """
    dano_efetivo = arrays["dano_efetivo"]  # (P_total, M_max, I)

    # Empilha todos os moves ativos de todos os pokes num unico array (N_moves, I)
    slices = [dano_efetivo[i_poke][move_indices]
              for i_poke, move_indices in zip(poke_indices, estado_indices)
              if move_indices]
    if not slices:
        return 0.0

    todos_danos = np.concatenate(slices, axis=0)  # (N_moves_total, I)
    return float(np.sum(np.max(todos_danos, axis=0)))



@cronometrar
def otimizar_time_sa(
    time,
    meta,
    max_iteracoes=25000,
    temperatura_inicial=150.0,
    cooling_rate=0.999,
    warm_start=None,  # dict {pokemon.name: (moveset_obj, score)} pré-calculado
):
    """
    Otimiza o moveset de um time de Pokémons usando Simulated Annealing.

    Hiperparâmetros sugeridos para espaço pequeno (~10-20 moves por Pokémon):
        temperatura_inicial=50.0  — permite aceitar pioras de até ~5% de score no início.
                                    Aumente para espaços maiores ou mais ruidosos.
        cooling_rate=0.995        — resfria ~1000 iterações até T~0.03*T0.
                                    Diminua (ex: 0.99) para convergir mais rápido,
                                    aumente (ex: 0.999) para explorar mais.
        max_iteracoes=5000        — suficiente para cobrir o espaço com cooling_rate=0.995.

    Args:
        time: lista de Pokémons (já com optimize_moveset chamado ou não — chama internamente).
        meta: lista de Pokémons inimigos.
        max_iteracoes: número total de iterações do SA.
        temperatura_inicial: temperatura de partida T0.
        cooling_rate: fator de resfriamento geométrico aplicado a cada iteração.

    Returns:
        (best_movesets, best_score) — melhor estado absoluto encontrado durante a busca,
        não necessariamente o último estado aceito.
    """
    for pokemon in time:
        pokemon.optimize_moveset()

    cache_dano, cache_bulk, arrays = construir_caches(time, meta)
    poke_idx  = arrays["poke_idx"]
    move_idx  = arrays["move_idx"]

    # Warm start: usa resultado pré-calculado se disponível, senão calcula
    estado_atual = []   # lista de listas de i_move_local
    for p in time:
        if warm_start and p.name in warm_start:
            melhor, _ = warm_start[p.name]
            melhor = tuple(melhor)
        else:
            melhor, _ = otimizar(p, meta, cache_bulk=cache_bulk, cache_dano=cache_dano, arrays=arrays)
        if melhor is None:
            melhor = tuple(p.moveset[:4])
        indices = [move_idx[poke_idx[p.name]][m.name] for m in melhor
                   if m.name in move_idx[poke_idx[p.name]]]
        estado_atual.append(indices)

    poke_indices = [poke_idx[p.name] for p in time]
    score_atual  = calcular_score_time_np(poke_indices, estado_atual, arrays)

    best_estado   = [list(x) for x in estado_atual]
    best_score    = score_atual

    # Pre-calcula sets de indices fora do moveset ativo — evita recriar a cada iteracao
    n_moves_por_poke = [len(arrays["move_lists"][i]) for i in poke_indices]

    T = temperatura_inicial

    for iteracao in range(max_iteracoes):
        if iteracao % (max_iteracoes // 10) == 0:
            nomes = '+'.join(p.name for p in time)
            barra = int(30 * iteracao / max_iteracoes)
            print(f"  SA [{nomes}] [{'#' * barra}{'.' * (30 - barra)}] {iteracao}/{max_iteracoes} best: {best_score:.2f} T: {T:.2f}  ", end="\r", flush=True)

        # Mutacao: sorteia 1 Pokemon e troca 1 move ativo por 1 fora do moveset
        idx_membro     = random.randrange(len(time))
        i_poke         = poke_indices[idx_membro]
        indices_ativos = estado_atual[idx_membro]
        ativos_set     = set(indices_ativos)
        indices_fora   = [i for i in range(n_moves_por_poke[idx_membro]) if i not in ativos_set]

        if not indices_fora or not indices_ativos:
            continue

        idx_remover = random.choice(indices_ativos)
        idx_inserir = random.choice(indices_fora)

        # Muta in-place e reverte se rejeitado — evita alocar lista nova
        pos = indices_ativos.index(idx_remover)
        indices_ativos[pos] = idx_inserir

        novo_score = calcular_score_time_np(poke_indices, estado_atual, arrays)

        delta = novo_score - score_atual
        if delta > 0 or random.random() < math.exp(delta / T):
            score_atual = novo_score
            if score_atual > best_score:
                best_score  = score_atual
                best_estado = [list(x) for x in estado_atual]
        else:
            # Reverte mutacao
            indices_ativos[pos] = idx_remover

        T *= cooling_rate

    # Reconstroi movesets_obj uma unica vez a partir do melhor estado
    best_movesets = [
        [arrays["move_lists"][poke_indices[k]][j] for j in best_estado[k]]
        for k in range(len(time))
    ]

    nomes = '+'.join(p.name for p in time)
    print(f"  SA [{nomes}] [{'#' * 30}] {max_iteracoes}/{max_iteracoes} best: {best_score:.2f} T: {T:.2f}  ")
    return best_movesets, best_score
