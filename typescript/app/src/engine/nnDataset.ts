// Geração do dataset de treino da função de valor construtiva.
// Cada amostra é (time parcial, candidato) -> score exato do TIME COMPLETO de onde
// veio aquele prefixo. Fontes: rollouts aleatórios + times produzidos por SA/GA/
// greedy (reaproveitados pelo harness, "sem custo adicional", como na proposta).

import { Pokemon } from './pokemon'
import { Move } from './move'
import type { BuildContext } from './greedyConstruct'
import { exactScoreUnits } from './greedyConstruct'
import { encodeSample, FEATURE_DIM, TYPES_18 } from './nnFeatures'
import type { EncodedUnit } from './nnFeatures'
import { otimizarTimeCompletoSA } from './teamSA'
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
  // Variedade de moveset: amostra o moveset de cada membro entre os top-`movesetVariety`
  // da espécie. >1 faz o dataset cobrir movesets alternativos (necessário para treinar
  // uma função de valor que sirva ao greedy com Top-K > 1). Default 1 = só o ótimo individual.
  movesetVariety?: number
}

function movesetOf(ctx: BuildContext, p: Pokemon, opts: DatasetOptions): EncodedUnit['moveset'] {
  const variety = Math.max(1, opts.movesetVariety ?? 1)
  const top = ctx.topKMovesets.get(p.name)
  if (top && top.length && variety > 1) {
    return top[opts.rng.int(Math.min(variety, top.length))]
  }
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
    units.push({ poke: p, moveset: movesetOf(ctx, p, opts) })
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

// ---- Exp3: dataset MISTO (aleatórios + times bons + vizinhos) ----
// Motivo (ver relatórios): só aleatório = a rede fica cega no TOPO (não sabe
// escolher); só time bom = cega no FUNDO (não sabe rejeitar candidato ruim). A
// mistura cobre os dois, e os VIZINHOS de times bons são o contraste "on-policy"
// (prefixo bom + candidato alternativo) nos pontos onde o greedy decide.

export interface MixedDatasetConfig {
  nRandom: number // rollouts aleatórios (fundo/contraste)
  monotypePerType: number // times bons por tipo (18 tipos)
  nGeneralGood: number // times bons no pool geral
  saIteracoes?: number // iterações de SA por time bom (default 4000)
  saBatch?: number // rodadas de SA por lote antes de checar saturação (default 10)
  maxSABatches?: number // teto de lotes por fonte (default 15)
}

export interface MixedBaseOptions {
  pool: Pokemon[]
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  timeFixo: Pokemon[]
}

// Identidade exata de um time (espécies + movesets), para deduplicar. Vizinhos
// que diferem por 1 membro/move NÃO são duplicatas — são o dado que interessa.
function assinaturaTime(units: EncodedUnit[]): string {
  return units
    .map(u => u.poke.name + '#' + u.moveset.map(m => m.name).slice().sort().join(','))
    .slice()
    .sort()
    .join('|')
}

function movesetIndividual(ctx: BuildContext, p: Pokemon): Move[] {
  return ctx.individualMovesets.get(p.name) ?? p.moveset.slice(0, 4)
}

function timeBomSA(ctx: BuildContext, base: MixedBaseOptions, pool: Pokemon[], rng: RNG, iter: number): EncodedUnit[] {
  const r = otimizarTimeCompletoSA(ctx, {
    pool,
    tamanhoTime: base.tamanhoTime,
    budget: base.budget,
    gruposExclusao: base.gruposExclusao,
    timeFixo: base.timeFixo,
    rng,
    maxIteracoes: iter,
  })
  return r.time.map((p, i) => ({ poke: p, moveset: r.movesets[i] }))
}

// Vizinho: troca 1 membro por outro candidato válido (budget + exclusão ok).
// É o contraste no ponto de decisão; o score dele é RE-AVALIADO por quem chama.
function vizinhoTroca1(
  ctx: BuildContext,
  base: MixedBaseOptions,
  pool: Pokemon[],
  units: EncodedUnit[],
  rng: RNG
): EncodedUnit[] | null {
  if (units.length === 0) return null
  const idx = rng.int(units.length)
  const nomes = new Set(units.map(u => u.poke.name))
  const custoAtual = units.reduce((a, u) => a + (ctx.custos[u.poke.name] ?? 0), 0)
  const custoSem = custoAtual - (ctx.custos[units[idx].poke.name] ?? 0)
  const candidatos = pool.filter(p => {
    if (nomes.has(p.name)) return false
    if (custoSem + (ctx.custos[p.name] ?? 999) > base.budget) return false
    for (const g of base.gruposExclusao) {
      if (g.includes(p.name) && units.some((u, i) => i !== idx && g.includes(u.poke.name))) return false
    }
    return true
  })
  if (candidatos.length === 0) return null
  const novo = candidatos[rng.int(candidatos.length)]
  const out = units.slice()
  out[idx] = { poke: novo, moveset: movesetIndividual(ctx, novo) }
  return out
}

// Coleta `quota` times DISTINTOS de um pool: SA em lotes até saturar (parar de
// achar time novo), depois preenche com vizinhos escorados dos que já tem.
function coletarTimesBons(
  ctx: BuildContext,
  base: MixedBaseOptions,
  pool: Pokemon[],
  quota: number,
  rng: RNG,
  cfg: MixedDatasetConfig
): EncodedUnit[][] {
  const saIter = cfg.saIteracoes ?? 4000
  const saBatch = cfg.saBatch ?? 10
  const maxBatches = cfg.maxSABatches ?? 15
  const seen = new Set<string>()
  const teams: EncodedUnit[][] = []
  const add = (u: EncodedUnit[]): boolean => {
    if (u.length === 0) return false
    const sig = assinaturaTime(u)
    if (seen.has(sig)) return false
    seen.add(sig)
    teams.push(u)
    return true
  }

  // fase 1: SA em lotes; para quando um lote inteiro não traz nada novo (saturou)
  for (let b = 0; b < maxBatches && teams.length < quota; b++) {
    let novos = 0
    for (let i = 0; i < saBatch && teams.length < quota; i++) {
      if (add(timeBomSA(ctx, base, pool, rng, saIter))) novos++
    }
    if (novos === 0) break
  }

  // fase 2: preenche a cota com vizinhos dos times já encontrados (contraste)
  const elite = teams.slice()
  const maxTentativas = Math.max(50, quota * 50)
  let tentativas = 0
  while (teams.length < quota && elite.length > 0 && tentativas < maxTentativas) {
    tentativas++
    const baseTeam = elite[rng.int(elite.length)]
    const v = vizinhoTroca1(ctx, base, pool, baseTeam, rng)
    if (v) add(v)
  }
  return teams
}

export type MixedProgress = (label: string, done: number, total: number) => void

// Gera o dataset misto do Exp3 num único budget. Monotype = pool filtrado por tipo.
export function gerarDatasetMisto(
  ctx: BuildContext,
  base: MixedBaseOptions,
  cfg: MixedDatasetConfig,
  rng: RNG,
  onProgress?: MixedProgress
): DatasetSample[] {
  const out: DatasetSample[] = []
  const emit = (units: EncodedUnit[]) => {
    if (units.length === 0) return
    const score = exactScoreUnits(ctx, units)
    for (const s of teamToSamples(ctx, units, score, rng)) out.push(s)
  }

  // fonte 1: rollouts aleatórios (fundo/contraste)
  const randOpts: DatasetOptions = {
    pool: base.pool,
    tamanhoTime: base.tamanhoTime,
    budget: base.budget,
    gruposExclusao: base.gruposExclusao,
    rng,
  }
  for (let i = 0; i < cfg.nRandom; i++) {
    emit(randomTeam(ctx, randOpts))
    if (onProgress && i % 500 === 0) onProgress('aleatórios', i, cfg.nRandom)
  }

  // fonte 2: times bons monotype (por tipo canônico)
  if (cfg.monotypePerType > 0) {
    for (let ti = 0; ti < TYPES_18.length; ti++) {
      const T = TYPES_18[ti]
      const poolT = base.pool.filter(p => p.type1 === T || p.type2 === T)
      if (poolT.length === 0) continue
      onProgress?.(`monotype ${T}`, ti, TYPES_18.length)
      for (const u of coletarTimesBons(ctx, base, poolT, cfg.monotypePerType, rng, cfg)) emit(u)
    }
  }

  // fonte 3: times bons completos (pool geral)
  if (cfg.nGeneralGood > 0) {
    onProgress?.('times completos bons', 0, 1)
    for (const u of coletarTimesBons(ctx, base, base.pool, cfg.nGeneralGood, rng, cfg)) emit(u)
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

// Serializa vários casos num único CSV com coluna 'case' (para train_all.py, que
// treina um modelo por caso agrupando por essa coluna).
export function serializarCSVBatch(perCase: { id: string; samples: DatasetSample[] }[]): string {
  const header = 'case,' + Array.from({ length: FEATURE_DIM }, (_, i) => `f${i}`).concat('target').join(',')
  const lines: string[] = []
  for (const { id, samples } of perCase) {
    for (const s of samples) {
      const parts = new Array<string>(FEATURE_DIM + 1)
      for (let i = 0; i < FEATURE_DIM; i++) parts[i] = fmt(s.features[i])
      parts[FEATURE_DIM] = fmt(s.target)
      lines.push(id + ',' + parts.join(','))
    }
  }
  return header + '\n' + lines.join('\n') + '\n'
}
