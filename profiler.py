"""
Profiler leve para o fluxo de otimização.

Uso:
    from profiler import cronometrar, gerar_relatorio_profiling

    @cronometrar
    def minha_funcao(...): ...

    gerar_relatorio_profiling(score_total, score_maximo)
"""

import os
import time
from datetime import datetime

PROFILING_ATIVO = False

# (total_segundos, n_chamadas)
_registros: dict[str, tuple[float, int]] = {}
_inicio_global: float = time.perf_counter()


def cronometrar(func):
    """Decorador que acumula tempo e contagem. No-op se PROFILING_ATIVO=False."""
    if not PROFILING_ATIVO:
        return func
    nome = func.__qualname__
    _registros[nome] = (0.0, 0)

    def wrapper(*args, **kwargs):
        t0 = time.perf_counter()
        resultado = func(*args, **kwargs)
        dt = time.perf_counter() - t0
        total, n = _registros[nome]
        _registros[nome] = (total + dt, n + 1)
        return resultado

    wrapper.__wrapped__ = func
    wrapper.__name__ = func.__name__
    wrapper.__qualname__ = func.__qualname__
    return wrapper


def gerar_relatorio_profiling(score_total: float, score_maximo: float, pasta: str = "results") -> str:
    tempo_total = time.perf_counter() - _inicio_global

    dados = []
    for nome, (total, chamadas) in _registros.items():
        media = total / chamadas if chamadas else 0.0
        pct = (total / tempo_total) * 100
        dados.append((nome, chamadas, total, media, pct))
    dados.sort(key=lambda x: x[2], reverse=True)

    tempo_contabilizado = sum(total for _, total, *_ in [(n, t, c, m, p) for n, c, t, m, p in dados])
    tempo_nao_contabilizado = tempo_total - tempo_contabilizado

    linhas = []
    linhas.append("=" * 60)
    linhas.append("RELATÓRIO DE PROFILING")
    linhas.append(f"Gerado em: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    linhas.append(f"Tempo total de execução: {tempo_total:.2f}s")
    linhas.append(f"Score final: {score_total:.2f} / {score_maximo:.0f}")
    linhas.append("=" * 60)

    col = "{:<35} {:>8} {:>10} {:>10} {:>7}"
    linhas.append(col.format("Função", "Chamadas", "Total (s)", "Média (s)", "% tempo"))
    linhas.append("-" * 75)
    for nome, chamadas, total, media, pct in dados:
        linhas.append(col.format(nome[:35], chamadas, f"{total:.4f}", f"{media:.6f}", f"{pct:.1f}%"))
    linhas.append("-" * 75)
    linhas.append(col.format(
        "[não contabilizado]", "-",
        f"{tempo_nao_contabilizado:.4f}", "-",
        f"{(tempo_nao_contabilizado / tempo_total) * 100:.1f}%"
    ))

    relatorio = "\n".join(linhas)
    print("\n" + relatorio)

    os.makedirs(pasta, exist_ok=True)
    caminho = os.path.join(pasta, f"profiling_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(relatorio)
    print(f"Profiling salvo em: {caminho}")
    return caminho
