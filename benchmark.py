"""
Microbenchmark: isola o custo real das funções core.
Roda sem depender do fluxo completo.
"""
import timeit

from loader import carregar_meta, carregar_time
from move_dict import get_type_multiplier

FONTES = ("Level", "TM", "Egg")

print("Carregando Pokémons...")
meta = carregar_meta(fontes=FONTES)
time_pokes = carregar_time(["Volcarona", "Vikavolt"], fontes=FONTES)

atacante = time_pokes[0]
defensor = meta[0]
move = atacante.moveset[0]

print(f"Atacante: {atacante.name} | Move: {move.name} | Defensor: {defensor.name}\n")

N = 1_000_000

t1 = timeit.timeit(lambda: atacante.calcular_dano_esperado(move, defensor), number=N)
print(f"calcular_dano_esperado  {N:>10,} chamadas  {t1:.3f}s  ({t1/N*1e6:.3f} µs/chamada)")

t2 = timeit.timeit(lambda: get_type_multiplier(move.type, defensor.type1, defensor.type2), number=N)
print(f"get_type_multiplier     {N:>10,} chamadas  {t2:.3f}s  ({t2/N*1e6:.3f} µs/chamada)")
