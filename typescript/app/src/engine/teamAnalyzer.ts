import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { calcularScoreCombate, otimizarTimeSA } from './optimizer'

export interface MembroTime {
  pokemon: Pokemon
  moveset: Move[]       // se otimizar=false: os 4 moves fixos (pokemon.moveset também restrito a eles)
  otimizar?: boolean    // se true: SA pode alterar o moveset deste membro
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
  movesetTimeBase: { nome: string; moveset: Move[] }[]  // movesets resolvidos do time original
  melhora: ConfrontoDetalhe[]
  piora: ConfrontoDetalhe[]
}

interface CoberturaEntry { score: number; pokemon: string; move: string }

function scoreTimeDetalhado(time: MembroTime[], meta: Pokemon[], priorities: Priorities): Map<string, CoberturaEntry> {
  const porInimigo = new Map<string, CoberturaEntry>()
  for (const inimigo of meta) {
    let melhor: CoberturaEntry = { score: 0, pokemon: '', move: '' }
    for (const { pokemon, moveset } of time) {
      for (const move of moveset) {
        const s = calcularScoreCombate(pokemon, inimigo, move, priorities).score
        if (s > melhor.score) melhor = { score: s, pokemon: pokemon.name, move: move.name }
      }
    }
    porInimigo.set(inimigo.name, melhor)
  }
  return porInimigo
}

function resolverTime(time: MembroTime[], meta: Pokemon[], priorities: Priorities): MembroTime[] {
  const temOtimizar = time.some(m => m.otimizar)
  if (!temOtimizar) return time

  // Membros estáticos: restringe pokemon.moveset aos 4 fixos antes de passar pro SA
  // Membros dinâmicos: pokemon.moveset já tem o pool completo
  const pokemonsParaSA = time.map(m => {
    if (!m.otimizar) {
      // clona o pokemon com moveset restrito para o SA não mexer
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

  return timeAtual.map((membroOriginal, idx) => {
    const timeNovo: MembroTime[] = [
      ...timeAtual.filter((_, i) => i !== idx),
      candidato,
    ]
    const timeNovoResolvido = resolverTime(timeNovo, meta, priorities)
    const candidatoResolvido = timeNovoResolvido[timeNovoResolvido.length - 1]

    const novoMap = scoreTimeDetalhado(timeNovoResolvido, meta, priorities)
    const novoTotal = [...novoMap.values()].reduce((a, b) => a + b.score, 0)

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
