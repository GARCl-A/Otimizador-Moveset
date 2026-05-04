"""
Adiciona ou atualiza um ou mais Pokemons no projeto.

Uso:
    python add_pokemon.py Garchomp
    python add_pokemon.py Ariados Kricketune "Tapu Koko"
"""
import os
import re
import sys

from meta import META
from scraper import (
    _criar_driver, _buscar_html, _fechar_driver,
    _salvar_moveset, _salvar_custo, _extrair_custo,
    _tem_moveset, _tem_custo,
)


def _meta_por_nome():
    return {nome: (num, t1, t2) for num, nome, t1, t2 in META}


def _inserir_no_meta(nome, numero, type1, type2):
    meta_path = os.path.join(os.path.dirname(__file__), "meta.py")
    with open(meta_path, encoding="utf-8") as f:
        linhas = f.read().splitlines()

    type2_repr = f'"{type2}"' if type2 else "None"
    nova_linha = f'    ({numero}, "{nome}", "{type1}", {type2_repr}),'

    insert_idx = None
    for i, linha in enumerate(linhas):
        m = re.match(r'\s*\((\d+),', linha)
        if m and int(m.group(1)) > numero:
            insert_idx = i
            break
    if insert_idx is None:
        for i in range(len(linhas) - 1, -1, -1):
            if linhas[i].strip() == "]":
                insert_idx = i
                break

    linhas.insert(insert_idx, nova_linha)
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")
    print(f"  [{nome}] inserido no meta.py (#{numero})")


def main():
    if len(sys.argv) < 2:
        print("Uso: python add_pokemon.py Pokemon1 Pokemon2 ...")
        sys.exit(1)

    nomes_input = sys.argv[1:]
    meta_map = _meta_por_nome()

    # --- Fase 1: coleta todos os dados antes de abrir o browser ---
    pokemons = []  # lista de (nome, numero, type1, type2, no_meta, falta_moveset, falta_custo)

    for nome in nomes_input:
        if nome in meta_map:
            numero, type1, type2 = meta_map[nome]
            print(f"[{nome}] encontrado no meta.py: #{numero} {type1}/{type2 or 'None'}")
            no_meta = True
        else:
            print(f"\n[{nome}] nao encontrado no meta.py. Informe os dados:")
            numero = int(input("  Numero da Pokedex: ").strip())
            type1  = input("  Tipo 1: ").strip()
            type2  = input("  Tipo 2 (Enter para nenhum): ").strip() or None
            no_meta = False

        falta_moveset = not _tem_moveset(numero)
        falta_custo   = not _tem_custo(nome)

        if not falta_moveset and not falta_custo:
            print(f"  [{nome}] todos os arquivos ja existem, pulando scrape.")

        pokemons.append((nome, numero, type1, type2, no_meta, falta_moveset, falta_custo))

    # --- Fase 2: scrape em lote (uma sessão do browser) ---
    precisam_scrape = [(n, num, fm, fc) for n, num, t1, t2, nm, fm, fc in pokemons if fm or fc]

    if precisam_scrape:
        print(f"\nIniciando scrape de {len(precisam_scrape)} Pokemon(s)...")
        driver = _criar_driver()
        try:
            for nome, numero, falta_moveset, falta_custo in precisam_scrape:
                faltando = []
                if falta_moveset: faltando.append("moveset+stats")
                if falta_custo:   faltando.append("custo")
                print(f"\n[{nome}] faltando: {', '.join(faltando)}")

                html = _buscar_html(numero, driver)

                if falta_moveset:
                    _salvar_moveset(numero, html)
                if falta_custo:
                    custo = _extrair_custo(html)
                    if custo is not None:
                        _salvar_custo(nome, custo)
                        print(f"  Custo: {custo}")
                    else:
                        print(f"  Custo nao encontrado — verifique manualmente.")
        finally:
            _fechar_driver(driver)

    # --- Fase 3: insere novos no meta.py ---
    for nome, numero, type1, type2, no_meta, _, _ in pokemons:
        if not no_meta:
            _inserir_no_meta(nome, numero, type1, type2)

    # --- Fase 4: rebuild do pokedex.json ---
    print("\nAtualizando pokedex.json...")
    import build_pokedex
    build_pokedex.build()


if __name__ == "__main__":
    main()
