from move import Move
from move_dict import get_type_multiplier
from move_utils import normalizar_dano_por_turno, podar_estritamente_dominados
from profiler import cronometrar


@cronometrar
def _calcular_dano_esperado(self, move, target):
    """Wrapper cronometrado de Pokemon.calcular_dano_esperado."""
    if move.effective_power <= 0 or move.acc <= 0:
        return 0.0
    if move.category == "Physical":
        atk_stat = self.attack
        def_stat = target.defense
    elif move.category == "Special":
        atk_stat = self.special_attack
        def_stat = target.special_defense
    else:
        return 0.0
    stab_multiplier = 1.5 if move.type in [self.type1, self.type2] else 1.0
    type_multiplier = get_type_multiplier(move.type, target.type1, target.type2)
    dano_bruto = (
        (((42 * move.effective_power * (atk_stat / def_stat)) / 50) + 2)
        * stab_multiplier
        * type_multiplier
    )
    dano_percentual = (dano_bruto / target.hp) * 100.0
    return min(dano_percentual, 100.0) * (move.acc / 100.0) ** 2


@cronometrar
def _optimize_moveset(self):
    """Wrapper cronometrado de Pokemon.optimize_moveset."""
    self.moveset = normalizar_dano_por_turno(self.moveset)
    self.moveset = podar_estritamente_dominados(self.moveset)


class Pokemon:
    """A class representing a Pokemon with its attributes and methods. NO NIVEL 100"""

    def __init__(
        self,
        *,
        name,
        type1,
        type2,
        attack,
        special_attack,
        defense,
        special_defense,
        base_hp,
        speed=0,
    ):

        self.name = name
        self.type1 = type1
        self.type2 = type2
        self.hp = (base_hp * 2) + 31 + 110
        self.attack = (attack * 2) + 31 + 5
        self.special_attack = (special_attack * 2) + 31 + 5
        self.defense = (defense * 2) + 31 + 5
        self.special_defense = (special_defense * 2) + 31 + 5
        self.speed = (speed * 2) + 31 + 5
        self.moveset = []

    @classmethod
    def from_wiki(cls, *, nome, type1, type2, df, stats, fontes=("Level",)):
        """Cria um Pokemon a partir dos dados scrapeados da wiki.

        Args:
            fontes: tupla com as fontes de moves permitidas.
                    Ex: ("Level",) para só level-up, ("Level", "TM") para level + TM.
        """
        pokemon = cls(
            name=nome,
            type1=type1,
            type2=type2,
            attack=stats["Attack"],
            special_attack=stats["SpAtk"],
            defense=stats["Defense"],
            special_defense=stats["SpDef"],
            base_hp=stats["HP"],
            speed=stats.get("Speed", 0),
        )
        df_filtrado = df[df["Source"].apply(lambda s: any(f in s for f in fontes))]
        for _, row in df_filtrado[["Name", "Type", "Category", "Power", "Accuracy"]].iterrows():
            move = Move(
                name=row["Name"],
                move_type=row["Type"],
                category=row["Category"],
                power=int(row["Power"]) if row["Power"] != "—" else 0,
                acc=int(row["Accuracy"]) if row["Accuracy"] != "—" else 0,
            )
            if move.name not in [m.name for m in pokemon.moveset]:
                pokemon.moveset.append(move)
        return pokemon

    def __str__(self):
        return (
            f"{self.name} ({self.type1}/{self.type2}) - Attack: {self.attack}, Special Attack: {self.special_attack}\nMoveset:\n"
            + "\n".join(
                [
                    f"  - {move.name} ({move.type}, {move.category}, Power: {move.power})"
                    for move in self.moveset
                ]
            )
        )

    def optimize_moveset(self):
        """Normalize and prune the moveset to keep only optimal moves."""
        _optimize_moveset(self)

    def calcular_dano_esperado(self, move, target):
        """Retorna o percentual de HP (0-100%) que o move tira do target em valor esperado."""
        return _calcular_dano_esperado(self, move, target)
