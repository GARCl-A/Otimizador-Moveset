import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'

export interface Arrays {
  danoEfetivo: Float32Array  // flat [P * M_max * I], row-major
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
  for (let k = 0; k < I; k++) {
    const inimigo = meta[k]
    const priosInimigo = inimigo.moveset.map(m => priorities[m.name] ?? 0)
    const speedI = speedInimigo[k]

    let melhorDanoInimigo = 0.0
    for (let mi = 0; mi < inimigo.moveset.length; mi++) {
      const d = inimigo.calcularDanoEsperado(inimigo.moveset[mi], time[0])
      if (d > melhorDanoInimigo) melhorDanoInimigo = d
    }

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

        if (danoMeu <= 0) {
          danoEfetivo[i * Mmax * I + j * I + k] = 0.0
          continue
        }

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

        danoEfetivo[i * Mmax * I + j * I + k] = euVenco ? danoMeu : 0.0
      }
    }
  }

  return { danoEfetivo, pokeIdx, moveIdx, moveLists, Mmax, P, I }
}

// ---------------------------------------------------------------------------
// calcularScoreTimeNp — equivalente ao calcular_score_time_np
// ---------------------------------------------------------------------------
export function calcularScoreTime(pokeIndices: number[], estadoIndices: number[][], arrays: Arrays): number {
  const { danoEfetivo, Mmax, I } = arrays
  let vitorias = 0

  for (let k = 0; k < I; k++) {
    let venceuInimigo = false

    for (let pi = 0; pi < pokeIndices.length; pi++) {
      const iPoke = pokeIndices[pi]
      for (const j of estadoIndices[pi]) {
        const dano = danoEfetivo[iPoke * Mmax * I + j * I + k]
        
        if (dano > 0) {
          venceuInimigo = true
          break
        }
      }
      if (venceuInimigo) break
    }

    if (venceuInimigo) vitorias++
  }

  return vitorias
}

// ---------------------------------------------------------------------------
// otimizar — testa todas as combinações de 4 moves
// ---------------------------------------------------------------------------
export function otimizar(
  pokemon: Pokemon,
  arrays: Arrays,
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
    const score = calcularScoreTime([iPoke], [indices], arrays)
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
  }: {
    maxIteracoes?: number
    temperaturaInicial?: number
    coolingRate?: number
    warmStart?: WarmStart
    onProgress?: ProgressCallback
  } = {}
): { movesets: Move[][]; score: number } {
  for (const p of time) p.optimizeMoveset()

  const arrays = construirCaches(time, meta, priorities)
  const { pokeIdx, moveIdx } = arrays

  // Estado inicial via warm start ou otimizar individual
  const estadoAtual: number[][] = []
  for (const p of time) {
    let melhorMoves: Move[]
    if (warmStart?.[p.name]) {
      melhorMoves = warmStart[p.name].moveset
    } else {
      melhorMoves = otimizar(p, arrays).moveset
    }
    const iPoke = pokeIdx.get(p.name)!
    const idxMap = moveIdx[iPoke]
    estadoAtual.push(melhorMoves.map(m => idxMap.get(m.name) ?? 0).filter(i => i >= 0))
  }

  const pokeIndices = time.map(p => pokeIdx.get(p.name)!)
  let scoreAtual = calcularScoreTime(pokeIndices, estadoAtual, arrays)
  let bestEstado = estadoAtual.map(x => [...x])
  let bestScore = scoreAtual

  const nMovesPorPoke = pokeIndices.map(i => arrays.moveLists[i].length)
  let T = temperaturaInicial

  for (let iter = 0; iter < maxIteracoes; iter++) {
    if (onProgress && iter % (maxIteracoes / 10) === 0) {
      onProgress(iter, maxIteracoes, bestScore)
    }

    const idxMembro = Math.floor(Math.random() * time.length)
    const iPoke = pokeIndices[idxMembro]
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

    const novoScore = calcularScoreTime(pokeIndices, estadoAtual, arrays)
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
// calcularScoreCombate — TTK-based combat evaluation
// ---------------------------------------------------------------------------
export interface CombatResult {
  score: number
  vencedor: 'eu' | 'inimigo' | 'empate'
  moveDecisivo: Move
  melhorMoveInimigo: Move | null
  euAtaqueiPrimeiro: boolean
  vidaRestanteVencedor: number
  ttkMeu: number
  ttkInimigo: number
  danoMeu: number
  danoInimigo: number
}

export function calcularScoreCombate(
  meuPoke: Pokemon,
  inimigo: Pokemon,
  meuAtaque: Move,
  priorities: Priorities
): CombatResult {
  const danoMeu = meuPoke.calcularDanoEsperado(meuAtaque, inimigo)

  const melhorMoveInimigo = inimigo.moveset.reduce<Move>(
    (best, m) => inimigo.calcularDanoEsperado(m, meuPoke) >= inimigo.calcularDanoEsperado(best, meuPoke) ? m : best,
    inimigo.moveset[0]
  )
  const danoInimigo = melhorMoveInimigo ? inimigo.calcularDanoEsperado(melhorMoveInimigo, meuPoke) : 0

  const ttkMeu = danoMeu > 0 ? Math.ceil(100 / danoMeu) : Infinity
  const ttkInimigo = danoInimigo > 0 ? Math.ceil(100 / danoInimigo) : Infinity

  const prioMeu = priorities[meuAtaque.name] ?? 0
  const prioInimigo = melhorMoveInimigo ? (priorities[melhorMoveInimigo.name] ?? 0) : 0
  const euAtaqueiPrimeiro =
    prioMeu > prioInimigo ? true :
    prioInimigo > prioMeu ? false :
    meuPoke.speed > inimigo.speed

  const euVenco =
    ttkMeu < ttkInimigo ||
    (ttkMeu === ttkInimigo && euAtaqueiPrimeiro)

  const vencedor = ttkMeu === Infinity && ttkInimigo === Infinity
    ? 'empate'
    : euVenco ? 'eu' : 'inimigo'

  const hitsRecebidos = euVenco ? ttkMeu - 1 + (euAtaqueiPrimeiro ? 0 : 1) : ttkInimigo
  const vidaRestanteVencedor = euVenco
    ? Math.max(0, 100 - hitsRecebidos * danoInimigo)
    : Math.max(0, 100 - hitsRecebidos * danoMeu)

  const score = euVenco ? vidaRestanteVencedor : 0

  return {
    score,
    vencedor,
    moveDecisivo: euVenco ? meuAtaque : melhorMoveInimigo,
    melhorMoveInimigo: melhorMoveInimigo ?? null,
    euAtaqueiPrimeiro,
    vidaRestanteVencedor,
    ttkMeu,
    ttkInimigo,
    danoMeu,
    danoInimigo,
  }
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
