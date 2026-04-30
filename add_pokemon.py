"""
Adiciona ou atualiza um Pokemon no projeto.

Uso:
    python add_pokemon.py <Nome do Pokemon>
    python add_pokemon.py Garchomp
"""
import json
import os
import sys

import pandas as pd

from meta import META
from scraper import _criar_driver, _buscar_html, _fechar_driver
from scraper import _salvar_moveset, _salvar_custo, _extrair_custo, _extrair_stats, _extrair_moves
from scraper import _csv_path, _stats_path, _tem_moveset, _tem_custo, DIR_ADDITIONAL, ARQUIVO_CUSTO


def _meta_por_nome():
    return {nome: (num, t1, t2) for num, nome, t1, t2 in META}


def _meta_por_numero():
    return {num: (nome, t1, t2) for num, nome, t1, t2 in META}


def _inserir_no_meta(nome, numero, type1, type2):
    """Insere o Pokemon no meta.py em ordem de numero."""
    meta_path = os.path.join(os.path.dirname(__file__), "meta.py")
    with open(meta_path, encoding="utf-8") as f:
        conteudo = f.read()

    type2_repr = f'"{type2}"' if type2 else "None"
    nova_linha = f'    ({numero}, "{nome}", "{type1}", {type2_repr}),'

    # Encontra a posição correta pela ordem numérica
    linhas = conteudo.splitlines()
    insert_idx = None
    for i, linha in enumerate(linhas):
        import re
        m = re.match(r'\s*\((\d+),', linha)
        if m and int(m.group(1)) > numero:
            insert_idx = i
            break

    if insert_idx is None:
        # Insere antes do fechamento da lista
        for i in range(len(linhas) - 1, -1, -1):
            if linhas[i].strip() == "]":
                insert_idx = i
                break

    linhas.insert(insert_idx, nova_linha)
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write("\n".join(linhas) + "\n")

    print(f"  [{nome}] inserido no meta.py (#{numero})")


def _verificar_faltantes(nome, numero):
    falta_moveset = not _tem_moveset(numero)
    falta_custo = not _tem_custo(nome)
    return falta_moveset, falta_custo


def main():
    if len(sys.argv) < 2:
        print("Uso: python add_pokemon.py <Nome do Pokemon>")
        sys.exit(1)

    nome = " ".join(sys.argv[1:])
    meta_map = _meta_por_nome()

    # --- Resolve numero e tipos ---
    if nome in meta_map:
        numero, type1, type2 = meta_map[nome]
        print(f"[{nome}] encontrado no meta.py: #{numero} {type1}/{type2 or 'None'}")
        no_meta = True
    else:
        print(f"[{nome}] nao encontrado no meta.py. Informe os dados:")
        numero = int(input("  Numero da Pokedex: ").strip())
        type1  = input("  Tipo 1: ").strip()
        type2  = input("  Tipo 2 (Enter para nenhum): ").strip() or None
        no_meta = False

    # --- Verifica o que falta ---
    falta_moveset, falta_custo = _verificar_faltantes(nome, numero)

    if not falta_moveset and not falta_custo:
        print(f"[{nome}] todos os arquivos ja existem.")
    else:
        faltando = []
        if falta_moveset: faltando.append("moveset+stats")
        if falta_custo:   faltando.append("custo")
        print(f"[{nome}] faltando: {', '.join(faltando)}. Iniciando scrape...")

        driver = _criar_driver()
        try:
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

    # --- Insere no meta.py se necessario ---
    if not no_meta:
        _inserir_no_meta(nome, numero, type1, type2)

    # --- Roda build_pokedex ---
    print("\nAtualizando pokedex.json...")
    import build_pokedex
    build_pokedex.build()


if __name__ == "__main__":
    main()
