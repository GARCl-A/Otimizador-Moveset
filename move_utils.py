ATAQUES_DOIS_TURNOS = {
    "Solar Beam",
    "Hyper Beam",
    "Giga Impact",
    "Bounce",
    "Dive",
    "Dig",
    "Frenzy Plant",
    "Solar Blade",
    "Future Sight",
    "Rock Wrecker",
    "Meteor Beam",
    "Meteor Assault",
    "Fly",
    "Double Shock",
    "Phantom Force",
    "Gigaton Hammer",
}
MENOS_UM_STATS = {"Superpower"}
MENOS_DOIS_STATS = {"Overheat", "Leaf Storm"}
DANO_EM_SI_MESMO = {
    "Flare Blitz",
    "Double-Edge",
    "Axe Kick",
    "Brave Bird",
    "Wild Charge",
    "Wood Hammer",
    "Supercell Slam",
    "Light of Ruin",
}
BANIDOS = {
    "Focus Punch",
    "First Impression",
    "Fake Out",
    "Explosion",
    "Self-Destruct",
    "Steel Roller",
    "Dream Eater",
    "Misty Explosion",
}  # IA não consegue garantir que não vai tomar dano no turno de preparo
TRAVAMENTO_E_CONFUSAO = {"Outrage", "Thrash", "Petal Dance", "Raging Fury"}

# moves com hits variaveis: cada hit tem chance acc de continuar, de min a max hits
# effective_power sera ajustado pelo valor esperado de hits
MULTI_HIT = {
    "Population Bomb": (1, 10),
    "Bullet Seed": (2, 5),
    "Rock Blast": (2, 5),
    "Icicle Spear": (2, 5),
    "Pin Missile": (2, 5),
    "Bone Rush": (2, 5),
    "Fury Attack": (2, 5),
    "Fury Swipes": (2, 5),
    "Comet Punch": (2, 5),
    "Tail Slap": (2, 5),
    "Water Shuriken": (2, 5),
    "Bonemerang": (2, 2),
    "Gear Grind": (2, 2),
    "Twineedle": (2, 2),
}


def _hits_esperados(min_hits: int, max_hits: int, acc: float) -> float:
    """Valor esperado de hits para um move multi-hit com acc por hit."""
    p = acc / 100.0
    ev = 0.0
    prob_chegou = 1.0
    for k in range(1, max_hits + 1):
        if k < max_hits:
            prob_exato = prob_chegou * p * (1 - p)
        else:
            prob_exato = prob_chegou * p
        if k >= min_hits:
            ev += k * prob_exato
        prob_chegou *= p
    return ev


def normalizar_dano_por_turno(movepool):
    """Ajusta effective_power para refletir o custo real por turno e remove moves banidos."""
    resultado = []
    for move in movepool:
        if move.name in BANIDOS or move.power <= 0:
            continue
        if move.name in ATAQUES_DOIS_TURNOS:
            move.effective_power = move.power / 2.0
            move.turns = 2
            if "2T" not in move.tags:
                move.tags.append("2T")
        elif move.name in MENOS_UM_STATS:
            move.effective_power = move.power * 0.835
            if "-1ST" not in move.tags:
                move.tags.append("-1ST")
        elif move.name in MENOS_DOIS_STATS:
            move.effective_power = move.power * 0.75
            if "-2ST" not in move.tags:
                move.tags.append("-2ST")
        elif move.name in TRAVAMENTO_E_CONFUSAO:
            move.effective_power = move.power * 0.75
            if "LOCK" not in move.tags:
                move.tags.append("LOCK")
        elif move.name in DANO_EM_SI_MESMO:
            move.effective_power = move.power * 0.66
            if "SD" not in move.tags:
                move.tags.append("SD")
        elif move.name in MULTI_HIT:
            min_h, max_h = MULTI_HIT[move.name]
            hits = _hits_esperados(min_h, max_h, move.acc)
            move.effective_power = move.power * hits
            tag = f"x{min_h}-{max_h}" if min_h != max_h else f"x{min_h}"
            if tag not in move.tags:
                move.tags.append(tag)
        resultado.append(move)
    return resultado


def podar_estritamente_dominados(movepool):
    """Remove moves obsoletos pelo valor esperado (effective_power * acc) por tipo+categoria."""
    from collections import defaultdict

    def ev(move):
        return move.effective_power * (move.acc / 100.0) ** 2

    # Para cada (type, category), guarda o melhor EV e o nome do vencedor (desempate)
    melhor_por_grupo: dict = defaultdict(lambda: (-1.0, ""))
    for m in movepool:
        chave = (m.type, m.category)
        ev_m = ev(m)
        ev_atual, nome_atual = melhor_por_grupo[chave]
        if ev_m > ev_atual or (ev_m == ev_atual and m.name < nome_atual):
            melhor_por_grupo[chave] = (ev_m, m.name)

    return [m for m in movepool if melhor_por_grupo[(m.type, m.category)][1] == m.name]
