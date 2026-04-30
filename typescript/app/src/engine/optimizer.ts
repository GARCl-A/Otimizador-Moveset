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

  // danoArray[i][j][k] = dano do poke i, move j, contra inimigo k
  const danoArray = new Float32Array(P * Mmax * I)
  for (let i = 0; i < P; i++) {
    for (let j = 0; j < time[i].moveset.length; j++) {
      for (let k = 0; k < I; k++) {
        danoArray[i * Mmax * I + j * I + k] = time[i].calcularDanoEsperado(time[i].moveset[j], meta[k])
      }
    }
  }

  // speedPoke[i], speedInimigo[k]
  const speedPoke = time.map(p => p.speed)
  const speedInimigo = meta.map(e => e.speed)

  // prioMove[i][j]
  const prioMove: number[][] = time.map(p => p.moveset.map(m => priorities[m.name] ?? 0))

  // bulk_contextual[i][j][k]: maior dano do inimigo k que age antes do move j do poke i
  const bulkContextual = new Float32Array(P * Mmax * I)
  for (let k = 0; k < I; k++) {
    const inimigo = meta[k]
    const priosInimigo = inimigo.moveset.map(m => priorities[m.name] ?? 0)
    const speedI = speedInimigo[k]

    for (let i = 0; i < P; i++) {
      const speedP = speedPoke[i]
      for (let j = 0; j < time[i].moveset.length; j++) {
        const prioMeuMove = prioMove[i][j]
        let maxDano = 0.0
        for (let mi = 0; mi < inimigo.moveset.length; mi++) {
          const prioIni = priosInimigo[mi]
          const ageAntes =
            prioIni > prioMeuMove ? true :
            prioMeuMove > prioIni ? false :
            speedI >= speedP
          if (ageAntes) {
            const d = inimigo.calcularDanoEsperado(inimigo.moveset[mi], time[i])
            if (d > maxDano) maxDano = d
          }
        }
        bulkContextual[i * Mmax * I + j * I + k] = maxDano
      }
    }
  }

  // danoEfetivo: zera onde inimigo mata antes
  const danoEfetivo = new Float32Array(P * Mmax * I)
  for (let idx = 0; idx < danoEfetivo.length; idx++) {
    danoEfetivo[idx] = bulkContextual[idx] >= 100.0 ? 0.0 : danoArray[idx]
  }

  return { danoEfetivo, pokeIdx, moveIdx, moveLists, Mmax, P, I }
}

// ---------------------------------------------------------------------------
// calcularScoreTimeNp — equivalente ao calcular_score_time_np
// ---------------------------------------------------------------------------
export function calcularScoreTime(pokeIndices: number[], estadoIndices: number[][], arrays: Arrays): number {
  const { danoEfetivo, Mmax, I } = arrays
  // Para cada inimigo k, pega o max de dano entre todos os moves ativos de todos os pokes
  const maxPorInimigo = new Float32Array(I)

  for (let pi = 0; pi < pokeIndices.length; pi++) {
    const iPoke = pokeIndices[pi]
    for (const j of estadoIndices[pi]) {
      const base = iPoke * Mmax * I + j * I
      for (let k = 0; k < I; k++) {
        const d = danoEfetivo[base + k]
        if (d > maxPorInimigo[k]) maxPorInimigo[k] = d
      }
    }
  }

  let total = 0.0
  for (let k = 0; k < I; k++) total += maxPorInimigo[k]
  return total
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
// calcularScoreCombate — equivalente ao calcular_score_combate (sem cache)
// ---------------------------------------------------------------------------
export function calcularScoreCombate(
  meuPoke: Pokemon,
  inimigo: Pokemon,
  meuAtaque: Move,
  priorities: Priorities
): number {
  const danoMeu = meuPoke.calcularDanoEsperado(meuAtaque, inimigo)

  const prioMeu = priorities[meuAtaque.name] ?? 0
  const prioInimigo = Math.max(0, ...inimigo.moveset.map(m => priorities[m.name] ?? 0))

  let inimigoAgePrimeiro: boolean
  if (prioMeu > prioInimigo) return danoMeu
  else if (prioInimigo > prioMeu) inimigoAgePrimeiro = true
  else inimigoAgePrimeiro = inimigo.speed >= meuPoke.speed

  if (!inimigoAgePrimeiro) return danoMeu

  const maiorDanoInimigo = Math.max(
    0,
    ...inimigo.moveset
      .filter(m => {
        const prioIni = priorities[m.name] ?? 0
        return prioIni > prioMeu || (prioIni === prioMeu && inimigo.speed >= meuPoke.speed)
      })
      .map(m => inimigo.calcularDanoEsperado(m, meuPoke))
  )

  return maiorDanoInimigo >= 100.0 ? 0.0 : danoMeu
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
