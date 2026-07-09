// Codificação de features para a rede neural (greedy-NN).
// É a ÚNICA fonte de verdade da codificação: o app gera o dataset com estas
// features e treina em Python sobre os vetores já prontos, e a inferência (mlp.ts)
// usa este mesmo encoder. Assim não há risco de divergência Python/TS.
//
// Layout por Pokémon (112 dims):
//   [0..17]   tipo multi-hot (18 tipos canônicos; dual-type acende 2 bits)
//   [18..23]  6 stats normalizados: HP, Attack, Defense, SpAtk, SpDef, Speed
//   [24..111] 4 moves x 22 atributos: tipo one-hot[18] + [categoria, power/200, acc/100, prio/6]
//
// O tipo do move é ONE-HOT (18 dims, 1 aceso), não um índice ordinal — tipos são
// categóricos, não têm ordem. Mesma lógica do tipo do Pokémon.
//
// Vetor final = 6 slots de time (padding zero p/ vazios) + 1 candidato = 7 x 112 = 784.

import type { Pokemon } from './pokemon'
import type { Move } from './move'
import type { Priorities } from './loader'

export const TYPES_18 = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const

const TYPE_INDEX: Record<string, number> = Object.fromEntries(TYPES_18.map((t, i) => [t, i] as const))

const TYPES_DIM = 18
const STATS_DIM = 6
const MOVES = 4
const MOVE_TYPE_DIM = 18 // tipo do move one-hot (categórico, sem ordem)
const MOVE_SCALARS = 4 // categoria, power, acc, prio
const PER_MOVE = MOVE_TYPE_DIM + MOVE_SCALARS // 22
export const PER_POKE = TYPES_DIM + STATS_DIM + MOVES * PER_MOVE // 112
export const TEAM_SLOTS = 6
export const FEATURE_DIM = PER_POKE * (TEAM_SLOTS + 1) // 308

// Divisores de normalização (apenas condicionamento; o StandardScaler do treino
// re-padroniza tudo, então a escala exata não é crítica — só precisa ser a mesma
// na geração do dataset e na inferência, o que é garantido por ser a mesma função).
const STAT_DIV = 600
const HP_DIV = 700
const POWER_DIV = 200
const ACC_DIV = 100
const PRIO_DIV = 6

export interface EncodedUnit {
  poke: Pokemon
  moveset: Move[]
}

function categoryCode(category: string): number {
  if (category === 'Physical') return 0.5
  if (category === 'Special') return 1.0
  return 0.0 // Status / outros
}

function encodeMove(out: Float32Array, base: number, move: Move | undefined, priorities: Priorities): void {
  if (!move) return // slot de move vazio = zeros
  const ti = TYPE_INDEX[move.type] // tipo one-hot [0..17]
  if (ti !== undefined) out[base + ti] = 1
  const s = base + MOVE_TYPE_DIM // escalares começam depois do one-hot
  out[s + 0] = categoryCode(move.category)
  out[s + 1] = Math.min(move.effectivePower, POWER_DIV) / POWER_DIV
  out[s + 2] = (move.acc ?? 0) / ACC_DIV
  out[s + 3] = (priorities[move.name] ?? 0) / PRIO_DIV
}

function encodePokemon(
  out: Float32Array,
  base: number,
  unit: EncodedUnit | undefined,
  priorities: Priorities
): void {
  if (!unit) return // slot de time vazio = zeros (padding)
  const { poke, moveset } = unit

  const i1 = TYPE_INDEX[poke.type1]
  if (i1 !== undefined) out[base + i1] = 1
  if (poke.type2) {
    const i2 = TYPE_INDEX[poke.type2]
    if (i2 !== undefined) out[base + i2] = 1
  }

  const s = base + TYPES_DIM
  out[s + 0] = poke.hp / HP_DIV
  out[s + 1] = poke.attack / STAT_DIV
  out[s + 2] = poke.defense / STAT_DIV
  out[s + 3] = poke.specialAttack / STAT_DIV
  out[s + 4] = poke.specialDefense / STAT_DIV
  out[s + 5] = poke.speed / STAT_DIV

  const mbase = base + TYPES_DIM + STATS_DIM
  for (let i = 0; i < MOVES; i++) {
    encodeMove(out, mbase + i * PER_MOVE, moveset[i], priorities)
  }
}

// Codifica (time parcial + candidato) no vetor de features de 784 dims.
export function encodeSample(
  partialTeam: EncodedUnit[],
  candidate: EncodedUnit,
  priorities: Priorities
): Float32Array {
  const out = new Float32Array(FEATURE_DIM)
  for (let i = 0; i < TEAM_SLOTS; i++) {
    encodePokemon(out, i * PER_POKE, partialTeam[i], priorities)
  }
  encodePokemon(out, TEAM_SLOTS * PER_POKE, candidate, priorities)
  return out
}

// Documentação legível do layout (usada no README do dataset e no artigo).
export function describeLayout(): string {
  return [
    `FEATURE_DIM=${FEATURE_DIM} (7 slots x ${PER_POKE}: 6 time + 1 candidato)`,
    `por Pokémon: tipo multi-hot[${TYPES_DIM}] + stats[${STATS_DIM}](HP,Atk,Def,SpA,SpD,Spe) + ${MOVES} moves x ${PER_MOVE}(tipo one-hot[${MOVE_TYPE_DIM}],cat,power,acc,prio)`,
    `tipos: ${TYPES_18.join(',')}`,
  ].join('\n')
}
