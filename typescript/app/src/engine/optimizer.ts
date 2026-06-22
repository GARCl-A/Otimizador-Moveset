import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'

export interface EvalParams {
  priorizarHP: boolean
  coberturasDupla: boolean
}

export interface Arrays {
  danoEfetivo: Float32Array
  hpRestante: Float32Array
  pokeIdx: Map<string, number>
  moveIdx: Map<string, number>[]
  moveLists: Move[][]
  Mmax: number
  P: number
  I: number
}

export interface WarmStart {
  [pokeName: string]: { moveset: Move[]; score: number }
}

export interface ProgressCallback {
  (iteracao: number, maxIteracoes: number, bestScore: number): void
}

// ---------------------------------------------------------------------------
// construirCaches
// ---------------------------------------------------------------------------
export function construirCaches(time: Pokemon[], meta: Pokemon[], priorities: Priorities): Arrays {
  const P = time.length
  const I = meta.length
  const Mmax = time.reduce((acc, p) => Math.max(acc, p.moveset.length), 1)

  const pokeIdx = new Map(time.map((p, i) => [p.name, i]))
  const moveIdx = time.map(p => new Map(p.moveset.map((m, j) => [m.name, j])))
  const moveLists = time.map(p => [...p.moveset])

  const danoArray = new Float32Array(P * Mmax * I)
  for (let i = 0; i < P; i++) {
    for (let j = 0; j < time[i].moveset.length; j++) {
      for (let k = 0; k < I; k++) {
        danoArray[i * Mmax * I + j * I + k] = time[i].calcularDanoEsperado(time[i].moveset[j], meta[k])
      }
    }
  }

  const speedPoke = time.map(p => p.speed)
  const speedInimigo = meta.map(e => e.speed)

  const prioMove: number[][] = time.map(p => p.moveset.map(m => priorities[m.name] ?? 0))

  const danoEfetivo = new Float32Array(P * Mmax * I)
  const hpRestante = new Float32Array(P * Mmax * I)
  for (let k = 0; k < I; k++) {
    const inimigo = meta[k]
    const priosInimigo = inimigo.moveset.map(m => priorities[m.name] ?? 0)
    const speedI = speedInimigo[k]

    for (let i = 0; i < P; i++) {
      const speedP = speedPoke[i]

      let maxDanoInimigoContraMim = 0.0
      for (let mi = 0; mi < inimigo.moveset.length; mi++) {
        const d = inimigo.calcularDanoEsperado(inimigo.moveset[mi], time[i])
        if (d > maxDanoInimigoContraMim) maxDanoInimigoContraMim = d
      }

      for (let j = 0; j < time[i].moveset.length; j++) {
        const danoMeu = danoArray[i * Mmax * I + j * I + k]
        const prioMeuMove = prioMove[i][j]

        if (danoMeu <= 0) continue

        const ttkMeu = Math.ceil(100.0 / danoMeu)
        const ttkInimigo = maxDanoInimigoContraMim > 0 ? Math.ceil(100.0 / maxDanoInimigoContraMim) : Infinity

        let prioMaxInimigo = -Infinity
        for (let mi = 0; mi < inimigo.moveset.length; mi++) {
          const p = priosInimigo[mi]
          if (p > prioMaxInimigo) prioMaxInimigo = p
        }

        const euAtaqueiPrimeiro =
          prioMeuMove > prioMaxInimigo ? true :
          prioMaxInimigo > prioMeuMove ? false :
          speedP > speedI

        const euVenco =
          ttkMeu < ttkInimigo ||
          (ttkMeu === ttkInimigo && euAtaqueiPrimeiro)

        if (!euVenco) continue

        const hitsRecebidos = ttkMeu - 1 + (euAtaqueiPrimeiro ? 0 : 1)
        const hp = Math.max(0, 100 - hitsRecebidos * maxDanoInimigoContraMim)

        danoEfetivo[i * Mmax * I + j * I + k] = danoMeu
        hpRestante[i * Mmax * I + j * I + k] = hp
      }
    }
  }

  return { danoEfetivo, hpRestante, pokeIdx, moveIdx, moveLists, Mmax, P, I }
}

// ---------------------------------------------------------------------------
// calcularScoreTimeNp — equivalente ao calcular_score_time_np
// ---------------------------------------------------------------------------
export function calcularScoreTime(
  pokeIndices: number[],
  estadoIndices: number[][],
  arrays: Arrays,
  evalParams: EvalParams = { priorizarHP: false, coberturasDupla: false }
): number {
  const { danoEfetivo, hpRestante, Mmax, I } = arrays
  const { priorizarHP, coberturasDupla } = evalParams
  let total = 0

  for (let k = 0; k < I; k++) {
    const vencedores: { pi: number; dano: number; hp: number }[] = []

    for (let pi = 0; pi < pokeIndices.length; pi++) {
      const iPoke = pokeIndices[pi]
      let melhorHP = -1
      let melhorDano = 0
      for (const j of estadoIndices[pi]) {
        const d = danoEfetivo[iPoke * Mmax * I + j * I + k]
        if (d <= 0) continue
        const hp = hpRestante[iPoke * Mmax * I + j * I + k]
        if (hp > melhorHP || (hp === melhorHP && d > melhorDano)) {
          melhorHP = hp
          melhorDano = d
        }
      }
      if (melhorHP < 0) continue
      vencedores.push({ pi, dano: melhorDano, hp: melhorHP })
    }

    if (vencedores.length === 0) continue

    vencedores.sort((a, b) => b.hp - a.hp || b.dano - a.dano)

    const primario = vencedores[0]
    const pontoBase = priorizarHP ? 4 : 1
    const bonusHP = priorizarHP && primario.hp === 100 ? 1 : 0
    total += pontoBase + bonusHP

    if (coberturasDupla && vencedores.length >= 2) {
      const secundario = vencedores[1]
      const bonusHPSec = priorizarHP && secundario.hp === 100 ? 1 : 0
      total += 1 + bonusHPSec
    }
  }

  return total
}

// ---------------------------------------------------------------------------
// otimizar — testa todas as combinações de 4 moves
// ---------------------------------------------------------------------------
export function otimizar(
  pokemon: Pokemon,
  arrays: Arrays,
  evalParams: EvalParams = { priorizarHP: false, coberturasDupla: false },
  onProgress?: (combinacao: number, total: number) => void
): { moveset: Move[]; score: number } {
  const iPoke = arrays.pokeIdx.get(pokemon.name)
  if (iPoke === undefined) return { moveset: pokemon.moveset.slice(0, 4), score: 0 }

  const moveIdxMap = arrays.moveIdx[iPoke]
  const moves = pokemon.moveset
  const n = moves.length
  const k = Math.min(4, n)

  let melhorScore = 0
  let melhorMoveset: Move[] = moves.slice(0, k)

  const combinacoes = combinations(n, k)
  for (let c = 0; c < combinacoes.length; c++) {
    const combo = combinacoes[c]
    const indices = combo.map(idx => moveIdxMap.get(moves[idx].name) ?? -1).filter(i => i >= 0)
    if (!indices.length) continue
    const score = calcularScoreTime([iPoke], [indices], arrays, evalParams)
    if (score > melhorScore) {
      melhorScore = score
      melhorMoveset = combo.map(idx => moves[idx])
    }
    if (onProgress && c % 100 === 0) onProgress(c, combinacoes.length)
  }

  return { moveset: melhorMoveset, score: melhorScore }
}

// ---------------------------------------------------------------------------
// otimizarTimeSA — Simulated Annealing
// ---------------------------------------------------------------------------
export function otimizarTimeSA(
  time: Pokemon[],
  meta: Pokemon[],
  priorities: Priorities,
  {
    maxIteracoes = 10000,
    temperaturaInicial = 200.0,
    coolingRate = 0.9995,
    warmStart,
    onProgress,
    evalParams = { priorizarHP: false, coberturasDupla: false },
  }: {
    maxIteracoes?: number
    temperaturaInicial?: number
    coolingRate?: number
    warmStart?: WarmStart
    onProgress?: ProgressCallback
    evalParams?: EvalParams
  } = {}
): { movesets: Move[][]; score: number } {
  for (const p of time) p.optimizeMoveset(false, false, priorities)

  const arrays = construirCaches(time, meta, priorities)
  const { pokeIdx, moveIdx } = arrays

  const estadoAtual: number[][] = []
  for (const p of time) {
    let melhorMoves: Move[]
    if (warmStart?.[p.name]) {
      melhorMoves = warmStart[p.name].moveset
    } else {
      melhorMoves = otimizar(p, arrays, evalParams).moveset
    }
    const iPoke = pokeIdx.get(p.name)!
    const idxMap = moveIdx[iPoke]
    estadoAtual.push(melhorMoves.map(m => idxMap.get(m.name) ?? 0).filter(i => i >= 0))
  }

  const pokeIndices = time.map(p => pokeIdx.get(p.name)!)
  let scoreAtual = calcularScoreTime(pokeIndices, estadoAtual, arrays, evalParams)
  let bestEstado = estadoAtual.map(x => [...x])
  let bestScore = scoreAtual

  const nMovesPorPoke = pokeIndices.map(i => arrays.moveLists[i].length)
  let T = temperaturaInicial

  for (let iter = 0; iter < maxIteracoes; iter++) {
    if (onProgress && iter % (maxIteracoes / 10) === 0) {
      onProgress(iter, maxIteracoes, bestScore)
    }

    const idxMembro = Math.floor(Math.random() * time.length)
    const indicesAtivos = estadoAtual[idxMembro]
    const ativosSet = new Set(indicesAtivos)
    const indicesFora: number[] = []
    for (let i = 0; i < nMovesPorPoke[idxMembro]; i++) {
      if (!ativosSet.has(i)) indicesFora.push(i)
    }

    if (!indicesFora.length || !indicesAtivos.length) continue

    const idxRemover = indicesAtivos[Math.floor(Math.random() * indicesAtivos.length)]
    const idxInserir = indicesFora[Math.floor(Math.random() * indicesFora.length)]

    const pos = indicesAtivos.indexOf(idxRemover)
    indicesAtivos[pos] = idxInserir

    const novoScore = calcularScoreTime(pokeIndices, estadoAtual, arrays, evalParams)
    const delta = novoScore - scoreAtual

    if (delta > 0 || Math.random() < Math.exp(delta / T)) {
      scoreAtual = novoScore
      if (scoreAtual > bestScore) {
        bestScore = scoreAtual
        bestEstado = estadoAtual.map(x => [...x])
      }
    } else {
      indicesAtivos[pos] = idxRemover
    }

    T *= coolingRate
  }

  const movesets = bestEstado.map((indices, k) =>
    indices.map(j => arrays.moveLists[pokeIndices[k]][j])
  )

  return { movesets, score: bestScore }
}

// ---------------------------------------------------------------------------
// Utilitário: combinações de índices
// ---------------------------------------------------------------------------
function combinations(n: number, k: number): number[][] {
  const result: number[][] = []
  const combo: number[] = []
  function recurse(start: number) {
    if (combo.length === k) { result.push([...combo]); return }
    for (let i = start; i < n; i++) {
      combo.push(i)
      recurse(i + 1)
      combo.pop()
    }
  }
  recurse(0)
  return result
}
