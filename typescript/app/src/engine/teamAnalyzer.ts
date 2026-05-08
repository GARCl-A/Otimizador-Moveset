import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, otimizarTimeSA } from './optimizer'

export interface MembroTime {
  pokemon: Pokemon
  moveset: Move[]
  otimizar?: boolean
}

export interface ConfrontoDetalhe {
  inimigo: string
  scoreOriginal: number
  scoreNovo: number
  delta: number
  cobertoAntesPor: { pokemon: string; move: string } | null
  cobertoDepoisPor: { pokemon: string; move: string } | null
}

export interface ResultadoSubstituicao {
  substitui: string
  scoreBefore: number
  scoreAfter: number
  delta: number
  movesetCandidato: Move[]
  movesetTimeBase: { nome: string; moveset: Move[] }[]
  melhora: ConfrontoDetalhe[]
  piora: ConfrontoDetalhe[]
}

export interface ResultadoTM {
  pokemon: string
  moveSubstituido: string
  scoreBefore: number
  scoreAfter: number
  delta: number
  melhora: ConfrontoDetalhe[]
  piora: ConfrontoDetalhe[]
}

interface CoberturaEntry { score: number; pokemon: string; move: string }

function scoreTimeDetalhado(time: MembroTime[], meta: Pokemon[], priorities: Priorities): Map<string, CoberturaEntry> {
  const pokemonsComMoveset = time.map(m => {
    const clone = Object.create(Object.getPrototypeOf(m.pokemon)) as Pokemon
    Object.assign(clone, m.pokemon)
    clone.moveset = m.moveset
    return clone
  })

  const arrays = construirCaches(pokemonsComMoveset, meta, priorities)
  const pokeIndices = pokemonsComMoveset.map(p => arrays.pokeIdx.get(p.name)!)
  const estadoIndices = pokemonsComMoveset.map((p, i) => {
    const moveIdxMap = arrays.moveIdx[pokeIndices[i]]
    return p.moveset.map(mv => moveIdxMap.get(mv.name) ?? -1).filter(j => j >= 0)
  })

  const porInimigo = new Map<string, CoberturaEntry>()
  const { danoEfetivo, hpRestante, Mmax, I } = arrays

  for (let k = 0; k < I; k++) {
    let melhor: CoberturaEntry = { score: 0, pokemon: '', move: '' }
    for (let pi = 0; pi < pokeIndices.length; pi++) {
      const iPoke = pokeIndices[pi]
      for (const j of estadoIndices[pi]) {
        const dano = danoEfetivo[iPoke * Mmax * I + j * I + k]
        if (dano > 0 && melhor.score === 0) {
          melhor = {
            score: 1,
            pokemon: pokemonsComMoveset[pi].name,
            move: arrays.moveLists[iPoke][j].name,
          }
        }
      }
    }
    porInimigo.set(meta[k].name, melhor)
  }

  return porInimigo
}

export function resolverTime(time: MembroTime[], meta: Pokemon[], priorities: Priorities): MembroTime[] {
  const temOtimizar = time.some(m => m.otimizar)
  if (!temOtimizar) return time

  const pokemonsParaSA = time.map(m => {
    if (!m.otimizar) {
      const clone = Object.create(Object.getPrototypeOf(m.pokemon))
      Object.assign(clone, m.pokemon)
      clone.moveset = [...m.moveset]
      return clone as Pokemon
    }
    return m.pokemon
  })

  const warmStart: Record<string, { moveset: Move[]; score: number }> = {}
  for (const m of time) {
    if (!m.otimizar) warmStart[m.pokemon.name] = { moveset: m.moveset, score: 0 }
  }

  const { movesets } = otimizarTimeSA(pokemonsParaSA, meta, priorities, { warmStart })

  return time.map((m, i) => ({ ...m, moveset: movesets[i] }))
}

function diffMaps(
  baseMap: Map<string, CoberturaEntry>,
  novoMap: Map<string, CoberturaEntry>,
  meta: Pokemon[]
): { melhora: ConfrontoDetalhe[]; piora: ConfrontoDetalhe[] } {
  const melhora: ConfrontoDetalhe[] = []
  const piora: ConfrontoDetalhe[] = []

  for (const inimigo of meta) {
    const antes = baseMap.get(inimigo.name)!
    const depois = novoMap.get(inimigo.name)!
    const delta = depois.score - antes.score
    if (Math.abs(delta) < 0.01) continue
    const entry: ConfrontoDetalhe = {
      inimigo: inimigo.name,
      scoreOriginal: antes.score,
      scoreNovo: depois.score,
      delta,
      cobertoAntesPor: antes.pokemon ? { pokemon: antes.pokemon, move: antes.move } : null,
      cobertoDepoisPor: depois.pokemon ? { pokemon: depois.pokemon, move: depois.move } : null,
    }
    if (delta > 0) melhora.push(entry)
    else piora.push(entry)
  }

  melhora.sort((a, b) => b.delta - a.delta)
  piora.sort((a, b) => a.delta - b.delta)

  return { melhora, piora }
}

export function analisarSubstituicao(
  timeAtual: MembroTime[],
  candidato: MembroTime,
  meta: Pokemon[],
  priorities: Priorities
): ResultadoSubstituicao[] {
  const timeResolvido = resolverTime(timeAtual, meta, priorities)
  const baseMap = scoreTimeDetalhado(timeResolvido, meta, priorities)
  const baseTotal = [...baseMap.values()].reduce((a, b) => a + b.score, 0)
  const movesetTimeBase = timeResolvido.map(m => ({ nome: m.pokemon.name, moveset: m.moveset }))

  const candidatoResolvido = resolverTime([candidato], meta, priorities)[0]

  return timeAtual.map((membroOriginal, idx) => {
    const timeNovo: MembroTime[] = [
      ...timeResolvido.filter((_, i) => i !== idx),
      candidatoResolvido,
    ]

    const novoMap = scoreTimeDetalhado(timeNovo, meta, priorities)
    const novoTotal = [...novoMap.values()].reduce((a, b) => a + b.score, 0)
    const { melhora, piora } = diffMaps(baseMap, novoMap, meta)

    return {
      substitui: membroOriginal.pokemon.name,
      scoreBefore: baseTotal,
      scoreAfter: novoTotal,
      delta: novoTotal - baseTotal,
      movesetCandidato: candidatoResolvido.moveset,
      movesetTimeBase,
      melhora,
      piora,
    }
  })
}

export function analisarTM(
  timeAtual: MembroTime[],
  tmMove: Move,
  meta: Pokemon[],
  priorities: Priorities
): ResultadoTM[] {
  const timeResolvido = resolverTime(timeAtual, meta, priorities)
  const baseMap = scoreTimeDetalhado(timeResolvido, meta, priorities)
  const baseTotal = [...baseMap.values()].reduce((a, b) => a + b.score, 0)

  const resultados: ResultadoTM[] = []

  for (let pi = 0; pi < timeResolvido.length; pi++) {
    const membro = timeResolvido[pi]
    const moveset = membro.moveset
    const podeAprender = membro.pokemon.moveset.some(m => m.name.toLowerCase() === tmMove.name.toLowerCase())
    if (!podeAprender) continue

    for (let mi = 0; mi < moveset.length; mi++) {
      const moveSubstituido = moveset[mi]
      if (moveSubstituido.name === tmMove.name) continue

      const novoMoveset = moveset.map((m, i) => i === mi ? tmMove : m)
      const timeNovo: MembroTime[] = timeResolvido.map((m, i) =>
        i === pi ? { ...m, moveset: novoMoveset } : m
      )

      const novoMap = scoreTimeDetalhado(timeNovo, meta, priorities)
      const novoTotal = [...novoMap.values()].reduce((a, b) => a + b.score, 0)
      const delta = novoTotal - baseTotal

      const { melhora, piora } = diffMaps(baseMap, novoMap, meta)

      resultados.push({
        pokemon: membro.pokemon.name,
        moveSubstituido: moveSubstituido.name,
        scoreBefore: baseTotal,
        scoreAfter: novoTotal,
        delta,
        melhora,
        piora,
      })
    }
  }

  return resultados.sort((a, b) => b.delta - a.delta)
}
