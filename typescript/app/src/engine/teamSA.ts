// Simulated Annealing de TIME COMPLETO (seleção de membros + movesets).
// A SA existente (optimizer.ts) só perturba movesets de um time fixo; este é o
// baseline perturbativo de verdade pedido na proposta: o estado é (6 membros +
// seus movesets) e a vizinhança troca 1 membro OU 1 move. Reusa o BuildContext
// (caches + movesets individuais) e a função de score exata calcularScoreTime.

import { Pokemon } from './pokemon'
import { Move } from './move'
import { calcularScoreTime } from './optimizer'
import type { BuildContext } from './greedyConstruct'
import type { RNG } from './rng'

export interface TeamSAOptions {
  pool: Pokemon[]
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  timeFixo: Pokemon[]
  rng: RNG
  maxIteracoes?: number
  temperaturaInicial?: number
  coolingRate?: number
}

export interface TeamSAResult {
  time: Pokemon[]
  movesets: Move[][]
  score: number
}

export function otimizarTimeCompletoSA(ctx: BuildContext, opts: TeamSAOptions): TeamSAResult {
  const { arrays, custos } = ctx
  const { rng } = opts
  const maxIteracoes = opts.maxIteracoes ?? 8000
  const T0 = opts.temperaturaInicial ?? 50
  const cooling = opts.coolingRate ?? 0.999

  const costOf = (name: string): number => custos[name] ?? 0
  const costFilter = (name: string): number => custos[name] ?? 999
  const movesetIndices = (pokeIdx: number): number[] => {
    const poke = ctx.pokemons[pokeIdx]
    const ms = ctx.individualMovesets.get(poke.name) ?? poke.moveset.slice(0, 4)
    const idxMap = arrays.moveIdx[pokeIdx]
    return ms.map(m => idxMap.get(m.name) ?? -1).filter(j => j >= 0)
  }
  const conflita = (name: string, nomesTime: string[]): boolean => {
    for (const grupo of opts.gruposExclusao) {
      if (grupo.includes(name) && nomesTime.some(n => grupo.includes(n))) return true
    }
    return false
  }

  // --- estado inicial: fixos + preenchimento aleatório válido ---
  const fixedNames = new Set(opts.timeFixo.map(p => p.name))
  const members: number[] = []
  const moveStates: number[][] = []
  let custoTotal = 0

  for (const p of opts.timeFixo) {
    const idx = arrays.pokeIdx.get(p.name)
    if (idx === undefined) continue
    members.push(idx)
    moveStates.push(movesetIndices(idx))
    custoTotal += costOf(p.name)
  }

  for (const p of rng.shuffle(opts.pool)) {
    if (members.length >= opts.tamanhoTime) break
    if (members.some(m => ctx.pokemons[m].name === p.name)) continue
    const c = costFilter(p.name)
    if (custoTotal + c > opts.budget) continue
    if (conflita(p.name, members.map(m => ctx.pokemons[m].name))) continue
    const idx = arrays.pokeIdx.get(p.name)
    if (idx === undefined) continue
    members.push(idx)
    moveStates.push(movesetIndices(idx))
    custoTotal += costOf(p.name)
  }

  let score = calcularScoreTime(members, moveStates, arrays, ctx.evalParams)
  let bestMembers = [...members]
  let bestMoves = moveStates.map(s => [...s])
  let bestScore = score

  let T = T0
  for (let iter = 0; iter < maxIteracoes; iter++) {
    const fazMembro = rng.random() < 0.5 && members.length > 0

    if (fazMembro) {
      // troca 1 membro não-fixo por um candidato de fora (budget + exclusão ok)
      const naoFixos = members
        .map((m, i) => ({ i, name: ctx.pokemons[m].name }))
        .filter(x => !fixedNames.has(x.name))
      if (naoFixos.length === 0) {
        T *= cooling
        continue
      }
      const alvo = naoFixos[rng.int(naoFixos.length)]
      const oldIdx = members[alvo.i]
      const oldName = ctx.pokemons[oldIdx].name
      const nomesSemAlvo = members.filter((_, i) => i !== alvo.i).map(m => ctx.pokemons[m].name)
      const custoSemAlvo = custoTotal - costOf(oldName)

      const candidatos = opts.pool.filter(p => {
        if (members.some(m => ctx.pokemons[m].name === p.name)) return false
        if (custoSemAlvo + costFilter(p.name) > opts.budget) return false
        if (conflita(p.name, nomesSemAlvo)) return false
        return arrays.pokeIdx.has(p.name)
      })
      if (candidatos.length === 0) {
        T *= cooling
        continue
      }
      const novo = candidatos[rng.int(candidatos.length)]
      const newIdx = arrays.pokeIdx.get(novo.name)!
      const oldMoves = moveStates[alvo.i]

      members[alvo.i] = newIdx
      moveStates[alvo.i] = movesetIndices(newIdx)
      const novoScore = calcularScoreTime(members, moveStates, arrays, ctx.evalParams)
      const delta = novoScore - score

      if (delta > 0 || rng.random() < Math.exp(delta / T)) {
        score = novoScore
        custoTotal = custoSemAlvo + costOf(novo.name)
        if (score > bestScore) {
          bestScore = score
          bestMembers = [...members]
          bestMoves = moveStates.map(s => [...s])
        }
      } else {
        members[alvo.i] = oldIdx
        moveStates[alvo.i] = oldMoves
      }
    } else {
      // troca 1 move ativo por um inativo num membro aleatório
      const mi = rng.int(members.length)
      const pokeIdx = members[mi]
      const ativos = moveStates[mi]
      const total = arrays.moveLists[pokeIdx].length
      if (ativos.length === 0 || ativos.length >= total) {
        T *= cooling
        continue
      }
      const ativosSet = new Set(ativos)
      const fora: number[] = []
      for (let j = 0; j < total; j++) if (!ativosSet.has(j)) fora.push(j)
      if (fora.length === 0) {
        T *= cooling
        continue
      }
      const pos = rng.int(ativos.length)
      const antigo = ativos[pos]
      ativos[pos] = fora[rng.int(fora.length)]

      const novoScore = calcularScoreTime(members, moveStates, arrays, ctx.evalParams)
      const delta = novoScore - score
      if (delta > 0 || rng.random() < Math.exp(delta / T)) {
        score = novoScore
        if (score > bestScore) {
          bestScore = score
          bestMembers = [...members]
          bestMoves = moveStates.map(s => [...s])
        }
      } else {
        ativos[pos] = antigo
      }
    }

    T *= cooling
  }

  const time = bestMembers.map(idx => ctx.pokemons[idx])
  const movesets = bestMembers.map((idx, k) => bestMoves[k].map(j => arrays.moveLists[idx][j]))
  return { time, movesets, score: bestScore }
}
