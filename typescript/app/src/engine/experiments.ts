// Harness de experimentos: roda um método de montagem de time e coleta métricas
// (score final exato, tempo de montagem, redundância de tipo). Os 4 métodos
// comparados são SA (perturbativo), GA (evolutivo), greedy-exato e greedy-NN
// (construtivos). Agregações alimentam os gráficos da aba Experimentos e o CSV.

import { Pokemon } from './pokemon'
import { Move } from './move'
import type { EvalParams } from './optimizer'
import type { BuildContext } from './greedyConstruct'
import { greedyConstruct, exactScoreUnits } from './greedyConstruct'
import { otimizarTimeCompletoSA } from './teamSA'
import { otimizarTimeGA } from './geneticOptimizer'
import { randomTeam } from './nnDataset'
import { encodeSample } from './nnFeatures'
import type { MLP } from './mlp'
import type { RNG } from './rng'

export type ExpMethod = 'sa' | 'ga' | 'greedy-exato' | 'greedy-nn'

export const METHOD_LABEL: Record<ExpMethod, string> = {
  sa: 'Simulated Annealing',
  ga: 'Genetic Algorithm',
  'greedy-exato': 'Greedy-Exato',
  'greedy-nn': 'Greedy-NN',
}

export interface ExperimentOptions {
  pool: Pokemon[]
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  timeFixo: Pokemon[]
  evalParams: EvalParams
  saIteracoes?: number
  gaPopulacao?: number
  gaGeracoes?: number
  gaMutacao?: number
}

export interface SingleRun {
  score: number
  scoreMaximo: number
  timeMs: number
  teamNames: string[]
  movesetNames: string[][]
  typeRedundancy: number
  k?: number // Top-K usado (só nos gulosos); SA/GA não usam
}

// Métodos construtivos puros são determinísticos dado o pool — N execuções
// coincidem, então o harness roda 1x e replica (poupa muito tempo).
export function isDeterministic(method: ExpMethod): boolean {
  return method === 'greedy-exato' || method === 'greedy-nn'
}

export function scoreMaximoDe(meta: Pokemon[], evalParams: EvalParams): number {
  const pontos =
    (evalParams.priorizarHP ? 4 : 1) + (evalParams.priorizarHP ? 1 : 0) + (evalParams.coberturasDupla ? 2 : 0)
  return meta.length * pontos
}

// Redundância de tipo = nº de tipos repetidos no time (soma de (ocorrências-1)).
export function typeRedundancyDe(team: Pokemon[]): number {
  const counts = new Map<string, number>()
  for (const p of team) {
    for (const t of [p.type1, p.type2]) {
      if (!t) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  let red = 0
  for (const c of counts.values()) if (c > 1) red += c - 1
  return red
}

export function runMethodOnce(
  method: ExpMethod,
  ctx: BuildContext,
  opts: ExperimentOptions,
  rng: RNG,
  mlp?: MLP,
  k?: number
): SingleRun {
  const t0 = performance.now()
  let time: Pokemon[]
  let movesets: Move[][]
  let score: number

  if (method === 'greedy-exato') {
    const r = greedyConstruct(
      ctx,
      { pool: opts.pool, tamanhoTime: opts.tamanhoTime, budget: opts.budget, gruposExclusao: opts.gruposExclusao, timeFixo: opts.timeFixo, k, rng },
      { type: 'exact' }
    )
    time = r.time
    movesets = r.movesets
    score = r.score
  } else if (method === 'greedy-nn') {
    if (!mlp) throw new Error('greedy-NN requer pesos do modelo carregados.')
    const r = greedyConstruct(
      ctx,
      { pool: opts.pool, tamanhoTime: opts.tamanhoTime, budget: opts.budget, gruposExclusao: opts.gruposExclusao, timeFixo: opts.timeFixo, k, rng },
      { type: 'nn', mlp }
    )
    time = r.time
    movesets = r.movesets
    score = r.score
  } else if (method === 'sa') {
    const r = otimizarTimeCompletoSA(ctx, {
      pool: opts.pool,
      tamanhoTime: opts.tamanhoTime,
      budget: opts.budget,
      gruposExclusao: opts.gruposExclusao,
      timeFixo: opts.timeFixo,
      rng,
      maxIteracoes: opts.saIteracoes,
    })
    time = r.time
    movesets = r.movesets
    score = r.score
  } else {
    // ga
    const r = otimizarTimeGA(
      ctx.pokemons,
      ctx.meta,
      ctx.custos,
      ctx.priorities,
      opts.tamanhoTime,
      opts.budget,
      opts.gruposExclusao,
      opts.timeFixo,
      {
        populationSize: opts.gaPopulacao,
        generations: opts.gaGeracoes,
        mutationRate: opts.gaMutacao,
        evalParams: opts.evalParams,
      }
    )
    time = r.time
    movesets = r.movesets
    score = r.score
  }

  const timeMs = performance.now() - t0
  const usaK = method === 'greedy-exato' || method === 'greedy-nn'
  return {
    score,
    scoreMaximo: scoreMaximoDe(ctx.meta, opts.evalParams),
    timeMs,
    teamNames: time.map(p => p.name),
    movesetNames: movesets.map(ms => ms.map(m => m.name)),
    typeRedundancy: typeRedundancyDe(time),
    k: usaK ? k : undefined,
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base]
}

export interface MethodAggregate {
  method: ExpMethod
  k?: number // Top-K (só nos gulosos); distingue séries greedy-nn K=1, K=3, ...
  caseId?: string // preenchido no modo batch
  n: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
  std: number
  meanTimeMs: number
  meanRedundancy: number
}

export function aggregate(method: ExpMethod, runs: SingleRun[], k?: number): MethodAggregate {
  const scores = runs.map(r => r.score).sort((a, b) => a - b)
  const n = scores.length
  const mean = n ? scores.reduce((a, b) => a + b, 0) / n : 0
  const variance = n ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0
  const meanTimeMs = n ? runs.reduce((a, r) => a + r.timeMs, 0) / n : 0
  const meanRedundancy = n ? runs.reduce((a, r) => a + r.typeRedundancy, 0) / n : 0
  return {
    method,
    k,
    n,
    min: scores[0] ?? 0,
    q1: quantile(scores, 0.25),
    median: quantile(scores, 0.5),
    q3: quantile(scores, 0.75),
    max: scores[n - 1] ?? 0,
    mean,
    std: Math.sqrt(variance),
    meanTimeMs,
    meanRedundancy,
  }
}

export interface ScatterPoint {
  exact: number
  predicted: number
}

// Pares (exato, previsto) para a dispersão da rede: amostra M times aleatórios e,
// para cada, prevê o score final adicionando o último membro aos 5 primeiros.
// Mede a calibração da função de valor contra a função de score exata.
export function scatterPredictedVsExact(
  ctx: BuildContext,
  opts: ExperimentOptions,
  mlp: MLP,
  m: number,
  rng: RNG
): ScatterPoint[] {
  const datasetOpts = {
    pool: opts.pool,
    tamanhoTime: opts.tamanhoTime,
    budget: opts.budget,
    gruposExclusao: opts.gruposExclusao,
    rng,
  }
  const points: ScatterPoint[] = []
  for (let i = 0; i < m; i++) {
    const units = randomTeam(ctx, datasetOpts)
    if (units.length < 2) continue
    const exact = exactScoreUnits(ctx, units)
    const predicted = mlp.predict(encodeSample(units.slice(0, -1), units[units.length - 1], ctx.priorities))
    points.push({ exact, predicted })
  }
  return points
}
