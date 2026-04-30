from scraper import scrape_moveset, verificar_e_scrape_em_lote
from pokemonModel import Pokemon
from meta import META
from profiler import cronometrar


@cronometrar
def pokemon_da_wiki(nome, numero_pokedex, type1, type2, fontes=("Level", "TM")):
    df, stats = scrape_moveset(numero_pokedex, attacker=True, nome_pokemon=nome)
    return Pokemon.from_wiki(
        nome=nome, type1=type1, type2=type2, df=df, stats=stats, fontes=fontes
    )


@cronometrar
def carregar_meta(fontes=("Level", "TM")):
    pokemons = [(nome, num) for num, nome, t1, t2 in META]
    verificar_e_scrape_em_lote(pokemons)
    meta = [pokemon_da_wiki(nome, num, t1, t2, fontes=fontes) for num, nome, t1, t2 in META]
    for p in meta:
        p.optimize_moveset()
    return meta


@cronometrar
def carregar_time(nomes, fontes=("Level", "TM")):
    """Carrega os Pokémons do time a partir de uma lista de nomes presentes no META."""
    meta_por_nome = {nome: (num, t1, t2) for num, nome, t1, t2 in META}
    ausentes = [n for n in nomes if n not in meta_por_nome]
    if ausentes:
        raise ValueError(f"Pokémons não encontrados no META: {ausentes}. Adicione-os ao meta.py antes de continuar.")
    pokemons = [(nome, meta_por_nome[nome][0]) for nome in nomes]
    verificar_e_scrape_em_lote(pokemons)
    return [pokemon_da_wiki(nome, *meta_por_nome[nome], fontes=fontes) for nome in nomes]
