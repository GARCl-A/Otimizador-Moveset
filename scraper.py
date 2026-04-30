"""Scraper para extrair o movepool de um Pokémon da wiki do PokeRogue."""

import io
import json
import os
import re
import sys
import time

import pandas as pd
import undetected_chromedriver as uc
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


DIR_MOVESETS  = os.path.join("results", "movesets")
DIR_STATS     = os.path.join("results", "stats")
DIR_ADDITIONAL = os.path.join("results", "additional_info")
ARQUIVO_CUSTO = os.path.join(DIR_ADDITIONAL, "cost.json")


# ---------------------------------------------------------------------------
# Helpers de cache
# ---------------------------------------------------------------------------

def _csv_path(numero_pokedex):
    return os.path.join(DIR_MOVESETS, f"pokemon_{numero_pokedex}_moveset.csv")

def _stats_path(numero_pokedex):
    return os.path.join(DIR_STATS, f"pokemon_{numero_pokedex}_moveset_stats.json")

def _custos_existentes():
    if os.path.exists(ARQUIVO_CUSTO):
        with open(ARQUIVO_CUSTO, encoding="utf-8") as f:
            return json.load(f)
    return {}

def _tem_moveset(numero_pokedex):
    return os.path.exists(_csv_path(numero_pokedex)) and os.path.exists(_stats_path(numero_pokedex))

def _tem_custo(nome):
    return nome in _custos_existentes()


# ---------------------------------------------------------------------------
# Browser
# ---------------------------------------------------------------------------

def _criar_driver():
    options = uc.ChromeOptions()
    options.headless = False
    return uc.Chrome(options=options, version_main=147)


def _buscar_html(numero_pokedex, driver):
    """Navega para a página do Pokémon e retorna o HTML. Requer driver aberto."""
    url = f"https://wiki.pokerogue.net/pokedex:{numero_pokedex}"
    print(f"Acessando {url}...")
    driver.get(url)

    try:
        WebDriverWait(driver, 8).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table"))
        )
    except Exception:
        input("Resolva o captcha no navegador e pressione ENTER para continuar...")
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table"))
        )

    time.sleep(2)
    return driver.page_source


def _fechar_driver(driver):
    with open(os.devnull, "w") as devnull:
        sys.stderr = devnull
        driver.quit()
    sys.stderr = sys.__stderr__


# ---------------------------------------------------------------------------
# Extratores
# ---------------------------------------------------------------------------

def _ler_tipo_ou_categoria(img_tag):
    if img_tag and img_tag.has_attr("src"):
        match = re.search(r"([a-zA-Z]+)\.png", img_tag["src"])
        if match:
            return match.group(1).capitalize()
    return "Normal"


def _extrair_moves(html):
    sopa = BeautifulSoup(html, "lxml")
    movimentos = []

    for tabela in sopa.find_all("table"):
        texto_tabela = tabela.text.lower()
        if "power:" not in texto_tabela or "acc:" not in texto_tabela:
            continue

        primeira_linha = tabela.find("tr").text.lower()
        if "level" in primeira_linha:
            fonte = "Level"
        elif "tm" in primeira_linha:
            fonte = "TM"
        elif "egg" in primeira_linha:
            fonte = "Egg"
        else:
            fonte = "Outro"

        for linha in tabela.find_all("tr"):
            colunas = linha.find_all("td")
            if len(colunas) < 3:
                continue

            nome      = colunas[-3].get_text(strip=True)
            icones    = colunas[-2].find_all("img")
            texto_stats = colunas[-1].text.strip()

            tipo      = _ler_tipo_ou_categoria(icones[0]) if len(icones) > 0 else "Normal"
            categoria = _ler_tipo_ou_categoria(icones[1]) if len(icones) > 1 else "Status"

            power_match = re.search(r"Power:\s*(\d+)", texto_stats)
            acc_match   = re.search(r"Acc:\s*(\d+)", texto_stats)

            movimentos.append({
                "Name":     nome,
                "Type":     tipo,
                "Category": categoria,
                "Power":    int(power_match.group(1)) if power_match else 0,
                "Accuracy": int(acc_match.group(1))   if acc_match   else 0,
                "Source":   fonte,
            })

    return movimentos


def _extrair_custo(html):
    sopa = BeautifulSoup(html, "lxml")
    for th in sopa.find_all("th"):
        if "Cost" in th.get_text():
            linha_custo = th.find_parent("tr").find_next_sibling("tr")
            if linha_custo:
                strong = linha_custo.find("strong")
                if strong:
                    return int(strong.get_text(strip=True))
    return None


def _extrair_stats(html):
    tabelas_pd = pd.read_html(io.StringIO(html), flavor="lxml")
    return {
        "HP":      int(tabelas_pd[2].iloc[0, 0]),
        "Attack":  int(tabelas_pd[3].iloc[0, 0]),
        "Defense": int(tabelas_pd[4].iloc[0, 0]),
        "SpAtk":   int(tabelas_pd[5].iloc[0, 0]),
        "SpDef":   int(tabelas_pd[6].iloc[0, 0]),
        "Speed":   int(tabelas_pd[7].iloc[0, 0]),
    }


# ---------------------------------------------------------------------------
# Salvadores
# ---------------------------------------------------------------------------

def _salvar_moveset(numero_pokedex, html):
    os.makedirs(DIR_MOVESETS, exist_ok=True)
    os.makedirs(DIR_STATS, exist_ok=True)

    stats = _extrair_stats(html)
    print(f"  Stats: {stats}")

    movimentos = _extrair_moves(html)
    print(f"  {len(movimentos)} moves encontrados (antes de deduplicar)")

    df = pd.DataFrame(movimentos)
    df = (
        df.groupby(["Name", "Type", "Category", "Power", "Accuracy"])["Source"]
        .apply(", ".join)
        .reset_index()
    )

    csv_saida   = _csv_path(numero_pokedex)
    stats_saida = _stats_path(numero_pokedex)
    df.to_csv(csv_saida, index=False)
    with open(stats_saida, "w", encoding="utf-8") as f:
        json.dump(stats, f)
    print(f"  Moveset salvo: {csv_saida} ({len(df)} golpes únicos)")


def _salvar_custo(nome, custo):
    os.makedirs(DIR_ADDITIONAL, exist_ok=True)
    dados = _custos_existentes()
    dados[nome] = custo
    with open(ARQUIVO_CUSTO, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def verificar_e_scrape_em_lote(pokemons):
    """
    Verifica quais dados estão faltando para cada Pokémon e faz o scraping
    de tudo que falta em uma única sessão do browser.

    Args:
        pokemons: lista de (nome, numero_pokedex)
    """
    precisam_scrape = []
    for nome, numero_pokedex in pokemons:
        falta_moveset = not _tem_moveset(numero_pokedex)
        falta_custo   = not _tem_custo(nome)
        if falta_moveset or falta_custo:
            precisam_scrape.append((nome, numero_pokedex, falta_moveset, falta_custo))

    if not precisam_scrape:
        print("Cache completo para todos os Pokémons.")
        return

    print(f"Scraping necessário para {len(precisam_scrape)} Pokémon(s)...")
    driver = _criar_driver()
    try:
        for nome, numero_pokedex, falta_moveset, falta_custo in precisam_scrape:
            print(f"\n[{nome}] falta: {'moveset ' if falta_moveset else ''}{'custo' if falta_custo else ''}")
            html = _buscar_html(numero_pokedex, driver)

            if falta_moveset:
                _salvar_moveset(numero_pokedex, html)

            if falta_custo:
                custo = _extrair_custo(html)
                if custo is not None:
                    _salvar_custo(nome, custo)
                    print(f"  Custo: {custo}")
                else:
                    print(f"  Custo não encontrado")
    finally:
        _fechar_driver(driver)


def scrape_moveset(numero_pokedex, attacker=False, nome_pokemon=None):
    """
    Lê o movepool do cache local. Assume que verificar_e_scrape_em_lote
    já foi chamado antes e os arquivos existem.

    Returns:
        DataFrame com o movepool, ou (DataFrame, stats) se attacker=True.
    """
    csv_saida   = _csv_path(numero_pokedex)
    stats_saida = _stats_path(numero_pokedex)

    df = pd.read_csv(csv_saida)
    with open(stats_saida, encoding="utf-8") as f:
        stats = json.load(f)

    return (df, stats) if attacker else df
