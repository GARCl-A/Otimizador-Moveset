// Construtor greedy genérico de time, parametrizado pelo AVALIADOR de candidatos.
// Usado tanto pelo greedy-exato (avaliador = função de score exata) quanto pelo
// greedy-NN (avaliador = predição da rede). Como só muda o oráculo, a comparação
// entre os dois é apples-to-apples — exatamente a contribuição central do trabalho.
//
// A cada slot vazio: para cada candidato válido (respeitando budget e grupos de
// exclusão, como o loop de runner.ts), monta (time parcial, candidato), pega o
// argmax do avaliador, adiciona, repete até completar o time. O score FINAL é
// sempre calculado pela função exata (justiça na comparação).

import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, calcularScoreTime, otimizar } from './optimizer'
import type { Arrays, EvalParams } from './optimizer'
import { encodeSample } from './nnFeatures'
import type { EncodedUnit } from './nnFeatures'
import type { MLP } from './mlp'
import type { RNG } from './rng'

export interface BuildContext {
  pokemons: Pokemon[]
  meta: Pokemon[]
  priorities: Priorities
  custos: Record<string, number>
  evalParams: EvalParams
  arrays: Arrays
  individualMovesets: Map<string, Move[]> // pokeName -> melhor moveset individual
}

export type Evaluator = { type: 'exact' } | { type: 'nn'; mlp: MLP }

export interface GreedyOptions {
  pool: Pokemon[] // candidatos selecionáveis (subconjunto de ctx.pokemons)
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  timeFixo: Pokemon[]
  rng?: RNG // não usado no argmax (determinístico), reservado para desempates
}

export interface GreedyResult {
  time: Pokemon[]
  movesets: Move[][]
  score: number
}

// Pré-computa caches e os movesets individuais ótimos uma única vez, para serem
// reutilizados por várias execuções de greedy/SA (os experimentos chamam isto 1x).
// Pré-condição: os Pokémon já devem ter optimizeMoveset() aplicado.
export function buildContext(
  pokemons: Pokemon[],
  meta: Pokemon[],
  priorities: Priorities,
  custos: Record<string, number>,
  evalParams: EvalParams
): BuildContext {
  const arrays = construirCaches(pokemons, meta, priorities)
  const individualMovesets = new Map<string, Move[]>()
  for (const p of pokemons) {
    const { moveset } = otimizar(p, arrays, evalParams)
    individualMovesets.set(p.name, moveset)
  }
  return { pokemons, meta, priorities, custos, evalParams, arrays, individualMovesets }
}

function unitsToIndices(ctx: BuildContext, units: EncodedUnit[]): { pokeIndices: number[]; estado: number[][] } {
  const pokeIndices: number[] = []
  const estado: number[][] = []
  for (const u of units) {
    const iPoke = ctx.arrays.pokeIdx.get(u.poke.name)
    if (iPoke === undefined) continue
    const idxMap = ctx.arrays.moveIdx[iPoke]
    pokeIndices.push(iPoke)
    estado.push(u.moveset.map(m => idxMap.get(m.name) ?? -1).filter(j => j >= 0))
  }
  return { pokeIndices, estado }
}

export function exactScoreUnits(ctx: BuildContext, units: EncodedUnit[]): number {
  const { pokeIndices, estado } = unitsToIndices(ctx, units)
  return calcularScoreTime(pokeIndices, estado, ctx.arrays, ctx.evalParams)
}

function makeEvaluator(ctx: BuildContext, evaluator: Evaluator): (partial: EncodedUnit[], cand: EncodedUnit) => number {
  if (evaluator.type === 'nn') {
    const mlp = evaluator.mlp
    return (partial, cand) => mlp.predict(encodeSample(partial, cand, ctx.priorities))
  }
  return (partial, cand) => exactScoreUnits(ctx, [...partial, cand])
}

export function greedyConstruct(ctx: BuildContext, opts: GreedyOptions, evaluator: Evaluator): GreedyResult {
  const { custos } = ctx
  const movesetOf = (p: Pokemon): Move[] => ctx.individualMovesets.get(p.name) ?? p.moveset.slice(0, 4)
  const evalCandidate = makeEvaluator(ctx, evaluator)

  const time: Pokemon[] = [...opts.timeFixo]
  const movesets: Move[][] = opts.timeFixo.map(movesetOf)
  let budgetRestante = opts.budget - time.reduce((acc, p) => acc + (custos[p.name] ?? 0), 0)

  while (time.length < opts.tamanhoTime) {
    const validos = opts.pool.filter(p => {
      if (time.some(t => t.name === p.name)) return false
      if ((custos[p.name] ?? 999) > budgetRestante) return false
      for (const grupo of opts.gruposExclusao) {
        if (grupo.includes(p.name) && time.some(t => grupo.includes(t.name))) return false
      }
      return true
    })
    if (!validos.length) break

    const partialUnits: EncodedUnit[] = time.map((p, i) => ({ poke: p, moveset: movesets[i] }))

    let best: Pokemon | null = null
    let bestMoveset: Move[] = []
    let bestVal = -Infinity
    for (const cand of validos) {
      const candUnit: EncodedUnit = { poke: cand, moveset: movesetOf(cand) }
      const val = evalCandidate(partialUnits, candUnit)
      if (val > bestVal) {
        bestVal = val
        best = cand
        bestMoveset = candUnit.moveset
      }
    }
    if (!best) break

    time.push(best)
    movesets.push(bestMoveset)
    budgetRestante -= custos[best.name] ?? 0
  }

  const score = exactScoreUnits(ctx, time.map((p, i) => ({ poke: p, moveset: movesets[i] })))
  return { time, movesets, score }
}
