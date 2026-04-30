import os
from datetime import datetime
from optimizer import calcular_score_combate, PRIORIDADES


def _sigla(nome):
    return nome[0].upper()


def _nome_arquivo(time, movesets, fontes, score):
    siglas = "".join(_sigla(p.name) for p in time)
    fontes_str = "".join(f[0] for f in fontes)
    score_str = f"{score:.0f}"
    return f"{siglas}_{fontes_str}_{score_str}.txt"


def gerar_relatorio(time, movesets, meta, fontes, score, pasta="results"):
    os.makedirs(pasta, exist_ok=True)
    nome_arquivo = _nome_arquivo(time, movesets, fontes, score)
    caminho = os.path.join(pasta, nome_arquivo)

    # Calcula cobertura: para cada inimigo, qual pokemon+move vence
    cobertura = {}  # inimigo.name -> (pokemon, move, ev, atacou_primeiro, vida_restante)
    for inimigo in meta:
        melhor_ev = 0.0
        melhor_pokemon = None
        melhor_move = None
        for pokemon, moveset in zip(time, movesets):
            for move in moveset:
                ev = calcular_score_combate(pokemon, inimigo, move)
                if ev > melhor_ev:
                    melhor_ev = ev
                    melhor_pokemon = pokemon
                    melhor_move = move

        atacou_primeiro = melhor_pokemon.speed > inimigo.speed if melhor_pokemon else False
        move_inimigo_antes = None
        dano_inimigo_antes = 0.0
        if melhor_pokemon is not None:
            prio_move_escolhido = PRIORIDADES.get(melhor_move.name, 0)
            moves_antes = [
                m for m in inimigo.moveset
                if (
                    PRIORIDADES.get(m.name, 0) > prio_move_escolhido
                    or (PRIORIDADES.get(m.name, 0) == prio_move_escolhido and inimigo.speed >= melhor_pokemon.speed)
                )
            ]
            if moves_antes:
                move_inimigo_antes = max(moves_antes, key=lambda m: inimigo.calcular_dano_esperado(m, melhor_pokemon))
                dano_inimigo_antes = inimigo.calcular_dano_esperado(move_inimigo_antes, melhor_pokemon)

        cobertura[inimigo.name] = (melhor_pokemon, melhor_move, melhor_ev, atacou_primeiro, move_inimigo_antes, dano_inimigo_antes)

    # Contribuição de cada move = soma dos EVs nos alvos onde ele é o escolhido
    contribuicao = {}  # (pokemon.name, move.name) -> float
    for inimigo_nome, (pokemon, move, ev, _, _, _) in cobertura.items():
        if pokemon is None:
            continue
        chave = (pokemon.name, move.name)
        contribuicao[chave] = contribuicao.get(chave, 0.0) + ev

    linhas = []
    linhas.append("Relatório de Otimização de Time")
    linhas.append(f"Gerado em: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    linhas.append(f"Fontes: {', '.join(fontes)}")
    linhas.append(f"Score Total: {score:.2f}")
    linhas.append("")

    # --- Movesets ---
    linhas.append("=" * 50)
    linhas.append("MOVESETS DO TIME")
    linhas.append("=" * 50)
    for pokemon, moveset in zip(time, movesets):
        linhas.append(f"\n{pokemon.name}:")
        for move in moveset:
            contrib = contribuicao.get((pokemon.name, move.name), 0.0)
            prio = PRIORIDADES.get(move.name, 0)
            tags = ([f"P{prio}"] if prio != 0 else []) + move.tags
            tag_str = f"({','.join(tags)})" if tags else ""
            nome_com_tag = f"{move.name}{tag_str}"
            linhas.append(f"  {nome_com_tag:<25} ({move.type:<10} {move.category:<10}) contrib: {contrib:.2f}")

    # --- Cobertura por alvo ---
    linhas.append("")
    linhas.append("=" * 50)
    linhas.append("COBERTURA POR ALVO")
    linhas.append("=" * 50)
    for inimigo in meta:
        pokemon, move, ev, atacou_primeiro, move_inimigo_antes, dano_inimigo_antes = cobertura[inimigo.name]
        tipos_inimigo = inimigo.type1 + (f"/{inimigo.type2}" if inimigo.type2 else "")
        if pokemon is None:
            linhas.append(f"  {inimigo.name:<15} ({tipos_inimigo:<15}) -> [sem cobertura]  0.00%")
            continue
        prio = PRIORIDADES.get(move.name, 0)
        prio_tag = f"[P{prio}]" if prio != 0 else ""
        if move_inimigo_antes is not None and dano_inimigo_antes > 0:
            prio_ini = PRIORIDADES.get(move_inimigo_antes.name, 0)
            prio_ini_tag = f"(P{prio_ini})" if prio_ini != 0 else ""
            ordem = f"2º, tomou {move_inimigo_antes.name}{prio_ini_tag} {dano_inimigo_antes:.1f}%"
        else:
            ordem = "1º"
        linhas.append(
            f"  {inimigo.name:<15} ({tipos_inimigo:<15}) "
            f"-> {pokemon.name:<12} usa {move.name:<20}{prio_tag} {ev:>6.2f}%  [{ordem}]"
        )

    with open(caminho, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    print(f"\nRelatório salvo em: {caminho}")
    return caminho
