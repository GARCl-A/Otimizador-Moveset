// Geração do dataset de treino da função de valor construtiva.
// Cada amostra é (time parcial, candidato) -> score exato do TIME COMPLETO de onde
// veio aquele prefixo. Fontes: rollouts aleatórios + times produzidos por SA/GA/
// greedy (reaproveitados pelo harness, "sem custo adicional", como na proposta).

import { Pokemon } from './pokemon'
import type { BuildContext } from './greedyConstruct'
import { exactScoreUnits } from './greedyConstruct'
import { encodeSample, FEATURE_DIM } from './nnFeatures'
import type { EncodedUnit } from './nnFeatures'
import type { RNG } from './rng'

export interface DatasetSample {
  features: Float32Array
  target: number
}

export interface DatasetOptions {
  pool: Pokemon[]
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  rng: RNG
}

function movesetOf(ctx: BuildContext, p: Pokemon): EncodedUnit['moveset'] {
  return ctx.individualMovesets.get(p.name) ?? p.moveset.slice(0, 4)
}

export function randomTeam(ctx: BuildContext, opts: DatasetOptions): EncodedUnit[] {
  const units: EncodedUnit[] = []
  const nomes = new Set<string>()
  let custo = 0
  for (const p of opts.rng.shuffle(opts.pool)) {
    if (units.length >= opts.tamanhoTime) break
    if (nomes.has(p.name)) continue
    if (custo + (ctx.custos[p.name] ?? 999) > opts.budget) continue
    let conflito = false
    for (const grupo of opts.gruposExclusao) {
      if (grupo.includes(p.name) && [...nomes].some(n => grupo.includes(n))) {
        conflito = true
        break
      }
    }
    if (conflito) continue
    units.push({ poke: p, moveset: movesetOf(ctx, p) })
    nomes.add(p.name)
    custo += ctx.custos[p.name] ?? 0
  }
  return units
}

// Decompõe um time completo nas amostras (prefixo, candidato) -> scoreFinal.
// A ordem é embaralhada para que a função de valor seja ~invariante à ordem.
export function teamToSamples(
  ctx: BuildContext,
  units: EncodedUnit[],
  finalScore: number,
  rng: RNG
): DatasetSample[] {
  const order = rng.shuffle(units)
  const samples: DatasetSample[] = []
  for (let k = 0; k < order.length; k++) {
    samples.push({
      features: encodeSample(order.slice(0, k), order[k], ctx.priorities),
      target: finalScore,
    })
  }
  return samples
}

// Gera nTeams rollouts aleatórios e emite suas amostras de prefixo.
export function gerarDataset(ctx: BuildContext, opts: DatasetOptions, nTeams: number): DatasetSample[] {
  const out: DatasetSample[] = []
  for (let i = 0; i < nTeams; i++) {
    const units = randomTeam(ctx, opts)
    if (units.length === 0) continue
    const score = exactScoreUnits(ctx, units)
    for (const s of teamToSamples(ctx, units, score, opts.rng)) out.push(s)
  }
  return out
}

function fmt(v: number): string {
  if (v === 0) return '0'
  return String(+v.toFixed(5))
}

// Serializa em CSV (colunas f0..fN,target) — formato direto para pandas no train.py.
export function serializarCSV(samples: DatasetSample[]): string {
  const header = Array.from({ length: FEATURE_DIM }, (_, i) => `f${i}`).concat('target').join(',')
  const lines = new Array<string>(samples.length)
  for (let r = 0; r < samples.length; r++) {
    const s = samples[r]
    const parts = new Array<string>(FEATURE_DIM + 1)
    for (let i = 0; i < FEATURE_DIM; i++) parts[i] = fmt(s.features[i])
    parts[FEATURE_DIM] = fmt(s.target)
    lines[r] = parts.join(',')
  }
  return header + '\n' + lines.join('\n') + '\n'
}
